'use strict';

import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ElkInput, TamperType, ElkContact, ElkMotion, ElkSmoke, ElkOutput, ElkTask, ElkPanel, ElkGarageDoor } from './accessories/index';
import Elk from 'elkmon';


export class ElkM1Platform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    private elkAddress: string;
    private elkPort: number;
    private area: number;
    private secure: boolean;
    private keypadCode: string;
    private userName: string;
    private password: string;
    private includedTasks: number[] = [];
    private includedOutputs: number[] = [];
    private zoneTypes: Record<number, string>;
    private zoneTexts = {};
    private outputs = {};
    private tasks = {};
    private garageDoors = {};
    private elk: Elk;
    private zoneAccessories: Record<number, ElkInput> = {};
    private garageDoorAccessories: ElkGarageDoor[] = [];

    private initialRetryDelay = 5000;
    private retryDelay = this.initialRetryDelay;

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);

        this.elkAddress = this.config.elkAddress;
        this.elkPort = this.config.elkPort;
        this.area = this.config.area;
        this.keypadCode = this.config.keypadCode;
        this.secure = this.config.secure;
        this.userName = this.config.userName;
        this.password = this.config.password;
        this.includedTasks = [];
        this.includedOutputs = [];
        if (undefined !== this.config.includedTasks) {
            this.includedTasks = this.config.includedTasks;
        }
        if (undefined !== this.config.includedOutputs) {
            this.includedOutputs = this.config.includedOutputs;
        }
        if (Array.isArray(this.config.zoneTypes)) {
            const zoneObjects = {};
            for (const zone of this.config.zoneTypes) {
                zoneObjects[zone.zoneNumber] = zone.zoneType;
            }
            this.zoneTypes = zoneObjects;
        } else {
            this.zoneTypes = this.config.zoneTypes;
        }

        this.garageDoors = {};
        if (this.config.garageDoors) {
            const gd = this.config.garageDoors;
            for (const index in gd) {
                this.garageDoors[gd[index].stateZone] = gd[index];
            }
        }

        if (this.secure) {
            this.log.debug('Secure connection');
            this.elk = new Elk(this.elkPort, this.elkAddress,
                {
                    secure: true,
                    userName: this.userName,
                    password: this.password,
                    keypadCode: this.keypadCode,
                    rejectUnauthorized: false,
                    secureProtocol: 'TLSv1_method',
                });
        } else {
            this.log.warn('Connection is not secure');
            this.elk = new Elk(this.elkPort, this.elkAddress, { secure: false });
        }

        this.elk.on('connected', () => {
            this.discoverDevices();
            this.retryDelay = this.initialRetryDelay;
        });

        this.elk.on('ZC', (msg) => {
            this.log.debug(msg);
            const accessory = this.zoneAccessories[msg.id];
            if ('undefined' !== typeof accessory) {
                accessory.setStatusFromMessage(msg);
            }
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
            this.retryDelay = this.retryDelay * 2;
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
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        this.log.info('***Connected***');
        this.elk.requestZoneStatusReport()
            .then((response) => {
                this.log.debug('Requesting area description');
                return this.elk.requestTextDescription(this.area, 1)
                    .then((areaText) => {
                        const device = {
                            area: this.area,
                            name: areaText.descriptionType,
                            displayName: areaText.description,
                            keypadCode: this.keypadCode,
                            elk: this.elk,
                        };
                        this.log.debug('Requesting zone descriptions');
                        this.addPanel(device);
                        return this.elk.requestTextDescriptionAll(0);
                    })
                    .then((zoneText) => {
                        this.log.debug('Received zone descriptions');
                        this.zoneTexts = {};
                        for (let i = 0; i < zoneText.length; i++) {
                            const td = zoneText[i];
                            this.zoneTexts[td.id] = td.description;
                        }
                        this.log.debug('Requesting task descriptions');
                        return this.elk.requestTextDescriptionAll(5);
                    })
                    .then((taskText) => {
                        this.log.debug('Received task descriptions');
                        this.tasks = {};
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
                        return this.elk.requestTextDescriptionAll(4);
                    })
                    .then((outputText) => {
                        this.outputs = {};
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
                    })
                    .then(() => {
                        for (const zone of response.zones) {
                            if ('Unconfigured' !== zone.logicalState && this.zoneTypes[zone.id] !== undefined) {
                                this.addZone(zone);
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
                    });
            }).catch((error) => {
                this.log.error('Error retrieving data from M1 panel');
                this.log.error(error);
                this.elk.disconnect();
                this.connect();
            });
    }

    addZone(zone) {
        const td = this.zoneTexts[zone.id];

        this.log.debug('Adding zone ' + td + ' id ' + zone.id + ' ' + zone.physicalState);
        const zoneType = this.zoneTypes[zone.id];

        const device = { name: td, id: zone.id, elk: this.elk };
        switch (zoneType) {
            case 'contact':
                this.addContact(device, zone);
                break;
            case 'ncContact':
                this.addContact(device, zone, TamperType.normallyClosed);
                break;
            case 'noContact':
                this.addContact(device, zone, TamperType.normallyOpen);
                break;
            case 'motion':
                this.addMotion(device, zone);
                break;
            case 'ncMotion':
                this.addMotion(device, zone, TamperType.normallyClosed);
                break;
            case 'noMotion':
                this.addMotion(device, zone, TamperType.normallyOpen);
                break;
            case 'smoke':
                this.addSmoke(device, zone);
                break;
            case 'ncSmoke':
                this.addSmoke(device, zone, TamperType.normallyClosed);
                break;
            case 'noSmoke':
                this.addSmoke(device, zone, TamperType.normallyOpen);
                break;
            case 'garage':
                if (this.garageDoors[`${zone.id}`]) {
                    const garageDoor = this.garageDoors[zone.id];
                    const device = { name: garageDoor.name, id: zone.id, elk: this.elk, garageDoor: garageDoor };
                    this.addGarageDoor(device);
                } else {
                    this.log.warn(`Zone ${zone.id} is of type garage door, but no matching garage door definition was found`);
                }
        }
    }

    addPanel(device) {
        const uuid = this.api.hap.uuid.generate(`ElkPanel${device.area}`);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing panel from cache:', existingAccessory.displayName);
            existingAccessory.context.device = device;
            new ElkPanel(this, existingAccessory);
        } else {
            this.log.info('Adding new Panel:', device.displayName);
            const accessory = new this.api.platformAccessory(device.displayName, uuid);
            accessory.context.device = device;
            new ElkPanel(this, accessory);
            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addOutput(device) {
        const uuid = this.api.hap.uuid.generate(`Output${device.id}`);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing output from cache:', existingAccessory.displayName);
            existingAccessory.context.device = device;
            new ElkOutput(this, existingAccessory);
        } else {
            this.log.info('Adding new Output:', device.displayName);
            const accessory = new this.api.platformAccessory(device.displayName, uuid);
            accessory.context.device = device;
            new ElkOutput(this, accessory);
            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addTask(device) {
        const uuid = this.api.hap.uuid.generate(`Task${device.id}`);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing task from cache:', existingAccessory.displayName);
            existingAccessory.context.device = device;
            new ElkTask(this, existingAccessory);
        } else {
            this.log.info('Adding new task:', device.displayName);
            const accessory = new this.api.platformAccessory(device.displayName, uuid);
            accessory.context.device = device;
            new ElkTask(this, accessory);
            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addInputAccessory(device, inputDesc, zoneMsg, inputType: typeof ElkInput, tamperType = TamperType.none) {
        device.displayName = (typeof device.name !== 'undefined') ? device.name :
            `${inputDesc} ${device.id}`;
        const uuid = this.api.hap.uuid.generate(`${inputDesc}${device.id}`);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
            existingAccessory.context.device = device;
            const input = new inputType(this, existingAccessory);
            input.tamperType = tamperType;
            input.setStatusFromMessage(zoneMsg);
            this.zoneAccessories[device.id] = input;
        } else {
            this.log.info('Adding new accessory:', device.displayName);

            // create a new accessory
            const accessory = new this.api.platformAccessory(device.displayName, uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            const input = new inputType(this, accessory);
            input.setStatusFromMessage(zoneMsg);
            input.tamperType = tamperType;
            this.zoneAccessories[device.id] = input;
            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addContact(device, zoneMsg, tamperType = TamperType.none) {
        this.addInputAccessory(device, 'Contact', zoneMsg, ElkContact, tamperType);
    }

    addMotion(device, zoneMsg, tamperType = TamperType.none) {
        this.addInputAccessory(device, 'Motion', zoneMsg, ElkMotion, tamperType);
    }

    addSmoke(device, zoneMsg, tamperType = TamperType.none) {
        this.addInputAccessory(device, 'Smoke', zoneMsg, ElkSmoke, tamperType);
    }

    addGarageDoor(device) {
        device.displayName = (typeof device.name !== 'undefined') ? device.name :
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
            this.log.info('Adding new garage door:', device.displayName);

            // create a new accessory
            const accessory = new this.api.platformAccessory(device.displayName, uuid);

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