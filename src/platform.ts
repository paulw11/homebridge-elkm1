'use strict';

import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import {
  ElkInput,
  ElkContact,
  ElkMotion,
  ElkSmoke,
  ElkCO,
  ElkCO2,
  ElkOutput,
  ElkTask,
  ElkPanel,
  ElkGarageDoor,
  ElkTemperature,
} from './accessories/index';
import { Elk, PhysicalStatus, ZoneChangeUpdate } from 'elkmon2';
import {
  ElkAreaConfig,
  ElkPlatformConfig,
  ElkZone,
  GarageDoor,
  ElkZoneType,
  ElkZoneDevice,
  PanelDefinition,
  ElkItem,
  ElkGarageDoorDevice,
} from './types/types';
import { ElkLeak } from './accessories/ElkLeak';

/**
 * Represents the Homebridge dynamic platform plugin for integrating Elk M1 security panels.
 *
 * The `ElkM1Platform` class manages the connection to the Elk M1 panel, discovers and registers Homebridge accessories
 * (such as zones, outputs, tasks, and garage doors), and handles communication and state updates between the Elk M1 system
 * and Homebridge.
 *
 * Key responsibilities:
 * - Establishes and maintains a TCP connection to the Elk M1 panel.
 * - Discovers and registers Homebridge accessories based on the Elk M1 configuration and panel state.
 * - Handles Homebridge lifecycle events, such as restoring cached accessories and launching discovery after startup.
 * - Listens for and processes Elk M1 events, updating accessory state accordingly.
 * - Implements retry logic for connection failures with exponential backoff.
 *
 * @remarks
 * This class is intended to be used as a Homebridge dynamic platform plugin. It expects a configuration object
 * conforming to `ElkPlatformConfig` and interacts with the Homebridge API.
 *
 * @example
 * // Example usage in Homebridge platform registration:
 * homebridge.registerPlatform('homebridge-elkm1', 'ElkM1Platform', ElkM1Platform);
 *
 * @see {@link https://github.com/homebridge/homebridge} for Homebridge platform plugin documentation.
 */
export class ElkM1Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private elkAddress: string;
  private elkPort: number;
  private areaConfigs: ElkAreaConfig[] = [];
  private includedTasks: number[] = [];
  private includedOutputs: number[] = [];
  private zoneTypes: Record<number, ElkZone> = {};
  private zoneTexts: Record<number, string> = {};
  private garageDoors: Record<number, GarageDoor> = {};
  private elk: Elk;
  private zoneAccessories: Record<number, ElkInput> = {};
  private garageDoorAccessories: ElkGarageDoor[] = [];

  private initialRetryDelay = 5000;
  private maxRetryDelay = 30000;
  private retryDelay = this.initialRetryDelay;
  private hasTemperatureZone = false;
  private connecting = false;
  private connected = false;

  /**
   * Constructs a new instance of the platform, initializing configuration, logging, and Homebridge API references.
   *
   * - Sets up area, task, output, and zone type configurations from the provided config.
   * - Initializes garage door configurations if present.
   * - Instantiates the Elk connection and sets up event listeners for connection, zone changes, generic messages, and errors.
   * - Handles Homebridge's `didFinishLaunching` event to trigger connection logic.
   *
   * @param log Logger instance for logging platform events.
   * @param config Platform configuration object, including Elk connection details and accessory settings.
   * @param api Homebridge API instance for registering services and characteristics.
   */
  constructor(
    public readonly log: Logger,
    public readonly config: ElkPlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.elkAddress = this.config.elkAddress;
    this.elkPort = this.config.elkPort;
    if (this.config.areas) {
      this.areaConfigs = this.config.areas;
    } else {
      if (this.config.area && this.config.keypadCode) {
        const areaConfig: ElkAreaConfig = {
          area: this.config.area,
          keypadCode: this.config.keypadCode,
        };
        this.areaConfigs = [areaConfig];
      } else {
        this.log.error(
          'No areas defined in config.json.  Please define at least one area.',
        );
      }
    }
    this.includedTasks = this.config.includedTasks ?? [];
    this.includedOutputs = this.config.includedOutputs ?? [];
    if (this.config.zoneTypes) {
      if (Array.isArray(this.config.zoneTypes)) {
        this.zoneTypes = Object.fromEntries(
          this.config.zoneTypes.map((zone) => [zone.zoneNumber, zone]),
        );
      } else {
        this.log.error(
          'zoneTypes in config.json is not an array.  This is not supported in version 4.0.0 and later.',
        );
      }
    }

    if (Array.isArray(this.config.garageDoors)) {
      this.config.garageDoors.forEach((door) => {
        this.garageDoors[door.stateZone] = door;
      });
    }

    const secure = this.config.secure ?? false;
    const { userName, password } = this.config;

    this.elk = new Elk(this.elkPort, this.elkAddress, {
      secure,
      userName,
      password,
    });

    this.elk.on('connected', () => {
      this.connecting = false;
      this.connected = true;
      this.discoverDevices();
      this.retryDelay = this.initialRetryDelay;
    });

    this.elk.on('ZC', (msg) => {
      this.log.debug(msg);
      const accessory = this.zoneAccessories[msg.id];
      accessory?.setStatusFromMessage(msg);

      for (const door of this.garageDoorAccessories) {
        if (msg.id === door.stateZone) {
          door.setState(msg);
        } else if (msg.id === door.obstructionZone) {
          door.setObstructionStatus(msg);
        }
      }
    });

    this.elk.on('*', (message) => {
      this.log.debug(message);
    });

    this.elk.on('error', (err) => {
      this.connected = false;
      this.log.error(
        `Error connecting to ElkM1 ${err}. Will retry in ${
          this.retryDelay / 1000
        }s`,
      );
      setTimeout(() => {
        this.connect();
      }, this.retryDelay);
      // this.retryDelay = this.retryDelay * 2; will overflow the int after enough retries.  Use maxRetryDelay to cap the delay.
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.connect();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Discovers and initializes devices connected to the Elk M1 panel.
   *
   * This method performs the following actions:
   * - Requests the current zone status report from the Elk M1 panel.
   * - Retrieves and adds area panels based on configured areas, including their text descriptions.
   * - Requests and stores descriptions for all zones.
   * - Requests and adds included tasks with their descriptions.
   * - Requests and adds included outputs with their descriptions.
   * - Adds configured zones that are not unconfigured and have a defined type.
   * - Initializes the state and obstruction status for garage door accessories.
   * - Requests the current arming status from the panel.
   * - Handles errors by logging them, disconnecting, and attempting to reconnect.
   *
   * @returns {Promise<void>} A promise that resolves when device discovery and initialization is complete.
   * @throws Will log and handle any errors encountered during the discovery process.
   */
  async discoverDevices() {
    this.log.info('***Connected***');
    try {
      const response = await this.elk.requestZoneStatusReport();

      this.log.debug('Requesting area description');
      for (const areaConfig of this.areaConfigs) {
        const areaText = await this.elk.requestTextDescription(
          areaConfig.area,
          1,
        );
        const device = {
          area: areaConfig.area,
          keypadCode: areaConfig.keypadCode,
          name: areaText.description,
          elk: this.elk,
        } satisfies PanelDefinition;
        this.log.debug(
          `Adding panel for area ${areaConfig.area} named ${areaText.description}`,
        );
        this.addPanel(device);
      }

      this.log.debug('Requesting zone descriptions');

      const zoneText = await this.elk.requestTextDescriptionAll(0);
      this.log.debug('Received zone descriptions');
      this.zoneTexts = {};
      for (let i = 0; i < zoneText.length; i++) {
        const td = zoneText[i];
        this.zoneTexts[td.id] = td.description;
      }

      this.log.debug('Requesting task descriptions');
      const taskText = await this.elk.requestTextDescriptionAll(5);
      this.log.debug('Received task descriptions');

      for (let i = 0; i < taskText.length; i++) {
        const td = taskText[i];
        if (this.includedTasks.includes(td.id)) {
          const device = {
            id: td.id,
            name: td.description,
            displayName: td.description,
            elk: this.elk,
          };
          this.addTask(device);
        }
      }

      this.log.debug('Requesting output descriptions');
      const outputText = await this.elk.requestTextDescriptionAll(4);

      this.log.debug('Received output descriptions');
      for (let i = 0; i < outputText.length; i++) {
        const td = outputText[i];
        if (this.includedOutputs.includes(td.id)) {
          const device = {
            id: td.id,
            name: td.description,
            displayName: td.description,
            elk: this.elk,
          };
          this.addOutput(device);
        }
      }

      for (const zone of response.zones) {
        if (
          zone.physicalStatus !== PhysicalStatus.Unconfigured &&
          this.zoneTypes[zone.id]
        ) {
          this.addZone(zone as ZoneChangeUpdate);
        }
      }

      if (this.hasTemperatureZone) {
        this.elk.requestTemperature();  // Get initial temperature values
        this.log.debug('Starting periodic temperature requests');
        setInterval(() => { 
          this.elk.requestTemperature();
        }, 60 * 1000); // every 1 minute
      } else {
        this.log.debug('No temperature zones configured');
      }
        
      this.log.debug('Checking initial garage door states');
      
      for (const garageDoor of this.garageDoorAccessories) {
        if (garageDoor.stateZone !== undefined) {
          garageDoor.setState(response.zones[garageDoor.stateZone - 1]);
        } else {
          this.log.debug(`Unable to set state of ${garageDoor.name}`);
        }

        if (garageDoor.obstructionZone !== undefined) {
          garageDoor.setObstructionStatus(
            response.zones[garageDoor.obstructionZone],
          );
        }
      }
      this.log.debug('Requesting arming status');
      this.elk.requestArmingStatus();
      this.log.info('Startup complete');
    } catch (error) {
      this.log.error('Error retrieving data from M1 panel');
      if (error instanceof Error) {
        this.log.error(error.message);
      } else {
        this.log.error(error as string);
      }
      this.elk.disconnect();
      this.connect();
    }
  }

  /**
   * Adds a zone accessory to the platform based on the provided zone update information.
   *
   * This method determines the type of the zone (e.g., contact, motion, smoke, CO, CO2, leak, garage door)
   * and creates the appropriate accessory using the corresponding handler. For garage door zones, it checks
   * for a matching garage door definition before adding the accessory. If the zone type is unsupported or
   * a required definition is missing, a warning is logged.
   *
   * @param zone - The update information for the zone, including its ID, physical status, and logical state.
   */
  addZone(zone: ZoneChangeUpdate) {
    const td = this.zoneTexts[zone.id];

    this.log.debug(
      `Adding zone ${td} ${zone.id} ${zone.physicalStatus} ${zone.logicalState}`,
    );
    const configZone = this.zoneTypes[zone.id];

    const device = {
      name: td,
      id: zone.id,
      elk: this.elk,
      zoneType: configZone.zoneType,
      tamperType: configZone.tamperType,
    } satisfies ElkZoneDevice;
    switch (configZone.zoneType) {
    case ElkZoneType.contact:
      this.addInputAccessory(device, zone, ElkContact);
      break;

    case ElkZoneType.motion:
      this.addInputAccessory(device, zone, ElkMotion);
      break;

    case ElkZoneType.smoke:
      this.addInputAccessory(device, zone, ElkSmoke);
      break;
    case ElkZoneType.co:
      this.addInputAccessory(device, zone, ElkCO);
      break;
    case ElkZoneType.co2:
      this.addInputAccessory(device, zone, ElkCO2);
      break;

    case ElkZoneType.leak:
      this.addInputAccessory(device, zone, ElkLeak);
      break;

    case ElkZoneType.garageDoor:
      if (this.garageDoors[`${zone.id}`]) {
        const garageDoor = this.garageDoors[zone.id];
        const device = {
          name: garageDoor.name,
          id: zone.id,
          elk: this.elk,
          garageDoor: garageDoor,
        };
        this.addGarageDoor(device);
      } else {
        this.log.warn(
          `Zone ${zone.id} is of type garage door, but no matching garage door definition was found`,
        );
      }
      break;
    case ElkZoneType.temperature:
      this.addTemperatureZone(device);
      break;
    default:
      this.log.warn(
        `Zone ${zone.id} is of unsupported type ${configZone.zoneType}`,
      );
    }
  }

  /**
   * Adds a new panel accessory or restores an existing one from cache based on the provided panel definition.
   *
   * This method checks if an accessory corresponding to the given panel already exists by generating a UUID
   * from the panel's area. If the accessory exists, it restores it from cache and updates its context.
   * Otherwise, it creates a new accessory, initializes it, and registers it with the platform.
   *
   * @param device - The definition of the panel to add, containing its configuration and metadata.
   */
  addPanel(device: PanelDefinition) {
    const uuid = this.api.hap.uuid.generate(`ElkPanel${device.area}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );
    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing panel from cache:',
        existingAccessory.displayName,
      );
      existingAccessory.context.device = device;
      new ElkPanel(this, existingAccessory);
    } else {
      this.log.info('Adding new Panel:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkPanel(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * Adds or restores an output accessory for the given Elk device.
   *
   * This method checks if an accessory corresponding to the provided ElkItem already exists
   * (based on a generated UUID). If it exists, it restores the accessory from cache and updates
   * its context. If it does not exist, it creates a new accessory, initializes it, and registers
   * it with the platform.
   *
   * @param device - The ElkItem representing the output device to add or restore.
   */
  addOutput(device: ElkItem) {
    const uuid = this.api.hap.uuid.generate(`Output${device.id}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );
    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing output from cache:',
        existingAccessory.displayName,
      );
      existingAccessory.context.device = device;
      new ElkOutput(this, existingAccessory);
    } else {
      this.log.info('Adding new Output:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkOutput(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * Adds a temperature zone accessory to the platform.
   * 
   * If an accessory for the given device already exists, it restores it from cache and updates its context.
   * Otherwise, it creates a new temperature sensor accessory and registers it with the platform.
   *
   * @param device - The ElkZoneDevice representing the temperature zone to add.
   */
  addTemperatureZone(device: ElkZoneDevice) {
    this.hasTemperatureZone = true;
    const uuid = this.api.hap.uuid.generate(`Temperature${device.id}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );
    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing temperature sensor from cache:',
        existingAccessory.displayName,
      );
      existingAccessory.context.device = device;
      new ElkTemperature(this, existingAccessory);
    } else {
      this.log.info('Adding new Temperature Sensor:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkTemperature(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * Adds a task accessory to the platform, either by restoring an existing accessory from cache
   * or by creating and registering a new one. Associates the provided ElkItem device with the accessory.
   *
   * @param device - The ElkItem device to add as a task accessory.
   */
  addTask(device: ElkItem) {
    const uuid = this.api.hap.uuid.generate(`Task${device.id}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );
    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing task from cache:',
        existingAccessory.displayName,
      );
      existingAccessory.context.device = device;
      new ElkTask(this, existingAccessory);
    } else {
      this.log.info('Adding new task:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkTask(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * Adds or restores an input accessory (such as contact, motion, smoke, CO, CO2, or leak sensor) for a given Elk zone device.
   *
   * If an accessory with the same UUID already exists, it restores the accessory from cache and updates its status.
   * Otherwise, it creates a new accessory, initializes it, and registers it with the platform.
   *
   * @param device - The Elk zone device to associate with the accessory.
   * @param zoneStatus - The current status update for the zone.
   * @param inputType - The class constructor for the type of input accessory to add (e.g., ElkContact, ElkMotion, etc.).
   */
  addInputAccessory(
    device: ElkZoneDevice,
    zoneStatus: ZoneChangeUpdate,
    inputType:
      | typeof ElkContact
      | typeof ElkMotion
      | typeof ElkSmoke
      | typeof ElkCO
      | typeof ElkCO2
      | typeof ElkLeak,
  ) {
    const inputDesc = inputType.INPUT_TYPE;
    const uuid = this.api.hap.uuid.generate(`${inputDesc}${device.id}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );

    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing accessory from cache:',
        existingAccessory.displayName,
      );
      existingAccessory.context.device = device;
      const input = new inputType(this, existingAccessory);
      input.setStatusFromMessage(zoneStatus);
      this.zoneAccessories[device.id] = input;
    } else {
      const accessory = new this.api.platformAccessory(device.name, uuid);
      this.log.info('Adding new accessory:', device.name);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      const input = new inputType(this, accessory);
      input.setStatusFromMessage(zoneStatus);
      this.zoneAccessories[device.id] = input;
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * Adds a garage door accessory to the platform.
   *
   * This method checks if an accessory for the given `ElkGarageDoorDevice` already exists.
   * If it exists, it restores the accessory from cache and updates its context.
   * If it does not exist, it creates a new accessory, stores the device in its context,
   * creates the accessory handler, and registers the accessory with the platform.
   *
   * @param device - The ElkGarageDoorDevice to add as an accessory.
   */
  addGarageDoor(device: ElkGarageDoorDevice) {
    device.name =
      typeof device.name !== 'undefined'
        ? device.name
        : `Garage door ${device.id}`;
    const uuid = this.api.hap.uuid.generate(`garageDoor${device.id}`);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );

    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing garage door from cache:',
        existingAccessory.displayName,
      );
      existingAccessory.context.device = device;
      const door = new ElkGarageDoor(this, existingAccessory);
      this.garageDoorAccessories.push(door);
    } else {
      this.log.info('Adding new garage door:', device.name);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.name, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      const door = new ElkGarageDoor(this, accessory);
      this.garageDoorAccessories.push(door);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * Attempts to establish a connection to the Elk M1 device.
   * Logs the connection attempt and handles any errors that occur during the process.
   *
   * @returns {Promise<void>} A promise that resolves when the connection attempt is complete.
   * @throws Logs an error message if the connection fails.
   */
  async connect() {
    if (this.connecting) {
      this.log.debug('Already attempting to connect to Elk M1');
      return;
    }
    this.connecting = true;
    try {
      this.log.info('Attempting to connect to Elk M1');
      this.elk.connect();
    } catch (err) {
      this.log.error(`Caught ${err} during connect`);
      this.connecting = false;
    }

  }
}
