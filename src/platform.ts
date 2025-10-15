'use strict';

import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ElkInput, ElkContact, ElkMotion, ElkSmoke, ElkCO, ElkCO2, ElkOutput, ElkTask, ElkPanel, ElkGarageDoor } from './accessories/index';
import Elk from 'elkmon';
import { PhysicalStatus } from 'elkmon/dist/lib/enums';
import { ElkAreaConfig,
  ElkPlatformConfig, 
  ElkZone, 
  GarageDoor, 
  ElkZoneType, 
  ElkZoneDevice, 
  PanelDefinition,
  ElkItem, 
  ElkGarageDoorDevice } from './types/types';
import { ZoneChangeUpdate } from 'elkmon/dist/lib/messages';
import { ElkLeak } from './accessories/ElkLeak';


export class ElkM1Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private elkAddress: string;
  private elkPort: number;
  private secure: boolean;
  private areaConfigs: ElkAreaConfig[] = [];
  private userName: string;
  private password: string;
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
      if (this.config.area && this.config.keyPadCode) {
        const areaConfig: ElkAreaConfig = {
          area: this.config.area,
          keypadCode: this.config.keyPadCode,
        };
        this.areaConfigs = [areaConfig];
      } else {
        this.log.error('No areas defined in config.json.  Please define at least one area.');
      }
    }
    this.secure = this.config.secure;
    this.userName = this.config.userName;
    this.password = this.config.password;
    this.includedTasks = this.config.includedTasks ?? [];
    this.includedOutputs = this.config.includedOutputs ?? [];
    if (this.config.zoneTypes) {
      if (Array.isArray(this.config.zoneTypes)) {
        this.zoneTypes = Object.fromEntries(
          this.config.zoneTypes.map(zone => [zone.zoneNumber, zone]),
        );
      } else {
        this.log.error('zoneTypes in config.json is not an array.  This is not supported in version 4.0.0 and later.');
      }
    }

    if (Array.isArray(this.config.garageDoors)) {
      this.config.garageDoors.forEach(door => {
        this.garageDoors[door.stateZone] = door;
      });
    }

    const elkOptions = {
      userName: this.userName,
      password: this.password,
      secure: this.secure,
      rejectUnauthorized: false,
      secureProtocol: 'TLSv1_method',
    };

    if (!this.secure) {
      this.log.warn('Connection is not secure');
    }
        
    this.elk = new Elk(this.elkPort, this.elkAddress,elkOptions);
        

    this.elk.on('connected', () => {
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
      this.log.error(`Error connecting to ElkM1 ${err}. Will retry in ${this.retryDelay/1000}s`);
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

  
  async discoverDevices() {
    this.log.info('***Connected***');
    try {
      const response = await this.elk.requestZoneStatusReport();

      this.log.debug('Requesting area description');
      for (const areaConfig of this.areaConfigs) {
        const areaText = await this.elk.requestTextDescription(areaConfig.area, 1);
        const device = {
          area: areaConfig.area,
          keypadCode: areaConfig.keypadCode,
          name: areaText.description,
          elk: this.elk,
        } satisfies PanelDefinition;
        this.log.debug(`Adding panel for area ${areaConfig.area} named ${areaText.description}`);
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
        if (zone.physicalStatus !== PhysicalStatus.Unconfigured && this.zoneTypes[zone.id]) {
          this.addZone(zone as ZoneChangeUpdate);
        }
      }
      this.log.debug('Checking initial garage door states');
      for (const garageDoor of this.garageDoorAccessories) {
        if (garageDoor.stateZone !== undefined) {
          garageDoor.setState(response.zones[garageDoor.stateZone-1]);
        } else {
          this.log.debug(`Unable to set state of ${garageDoor.name}`);
        }

        if (garageDoor.obstructionZone !== undefined) {
          garageDoor.setObstructionStatus(response.zones[garageDoor.obstructionZone]);
        }
      }
      this.log.debug('Requesting arming status');
      this.elk.requestArmingStatus();
      this.log.info('Startup complete');
    } catch (error) {
      this.log.error('Error retrieving data from M1 panel');
      if (error instanceof Error) {
        this.log.error(error.message);
      }
      this.elk.disconnect();
      this.connect();
    }
  }

  addZone(zone: ZoneChangeUpdate) {
    const td = this.zoneTexts[zone.id];

    this.log.debug(`Adding zone ${td} ${zone.id} ${zone.physicalStatus} ${zone.logicalState}`);
    const configZone = this.zoneTypes[zone.id];

    const device = { name: td, id: zone.id, elk: this.elk, zoneType: configZone.zoneType, tamperType: configZone.tamperType } satisfies ElkZoneDevice;
    switch (configZone.zoneType) {
    case ElkZoneType.contact:
      this.addInputAccessory(device, zone, ElkContact );
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
        const device = { name: garageDoor.name, id: zone.id, elk: this.elk, garageDoor: garageDoor };
        this.addGarageDoor(device);
      } else {
        this.log.warn(`Zone ${zone.id} is of type garage door, but no matching garage door definition was found`);
      }
      break;
    default:
      this.log.warn(`Zone ${zone.id} is of unsupported type ${configZone.zoneType}`);
    }
  }

  addPanel(device: PanelDefinition) {
    const uuid = this.api.hap.uuid.generate(`ElkPanel${device.area}`);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing panel from cache:', existingAccessory.displayName);
      existingAccessory.context.device = device;
      new ElkPanel(this, existingAccessory);
    } else {
      this.log.info('Adding new Panel:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkPanel(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  addOutput(device: ElkItem) {
    const uuid = this.api.hap.uuid.generate(`Output${device.id}`);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing output from cache:', existingAccessory.displayName);
      existingAccessory.context.device = device;
      new ElkOutput(this, existingAccessory);
    } else {
      this.log.info('Adding new Output:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkOutput(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  addTask(device: ElkItem) {
    const uuid = this.api.hap.uuid.generate(`Task${device.id}`);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing task from cache:', existingAccessory.displayName);
      existingAccessory.context.device = device;
      new ElkTask(this, existingAccessory);
    } else {
      this.log.info('Adding new task:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ElkTask(this, accessory);
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  addInputAccessory(device: ElkZoneDevice, zoneStatus: ZoneChangeUpdate, inputType: typeof ElkContact 
    | typeof ElkMotion 
    | typeof ElkSmoke
    | typeof ElkCO 
    | typeof ElkCO2 
    | typeof ElkLeak) {
    const inputDesc = inputType.INPUT_TYPE;
    const uuid = this.api.hap.uuid.generate(`${inputDesc}${device.id}`);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
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
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  addGarageDoor(device: ElkGarageDoorDevice) {
    device.name = (typeof device.name !== 'undefined') ? device.name :
      `Garage door ${device.id}`;
    const uuid = this.api.hap.uuid.generate(`garageDoor${device.id}`);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing garage door from cache:', existingAccessory.displayName);
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
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  async connect() {
    try {
      this.log.info('Attempting to connect to Elk M1');
      this.elk.connect();
    } catch (err) {
      this.log.error(`Caught ${err} during connect`);
    }
  }
}