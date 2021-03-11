'use strict';

import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ElkInput, TamperType, ElkContact, ElkMotion, ElkSmoke, ElkOutput, ElkTask, ElkPanel } from './accessories/index';
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

        if (this.secure) {
            this.log.debug('Secure connection');
            this.elk = new Elk(this.elkPort, this.elkAddress,
                {
                    secure: true,
                    userName: this.userName,
                    password: this.password,
                    keypadCode: this.keypadCode,
                    rejectUnauthorized: false,
                    secureProtocol: 'TLS1_method',
                });
        } else {
            this.log.warn('Connection is not secure');
            this.elk = new Elk(this.elkPort, this.elkAddress, { secure: false });
        }

        this.elk.on('connected', () => {
            this.discoverDevices();
        });


        this.elk.on('*', (message) => {
            this.log.debug(message);
        });

        this.elk.on('ZC', (msg) => {
            this.log.debug(msg);
            const accessory = this.zoneAccessories[msg.id];
            if ('undefined' !== typeof accessory) {
                accessory.setStatusFromMessage(msg);
            }
        });

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            this.elk.connect();
            // run the method to discover / register your devices as accessories
            //  this.discoverDevices();
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

                        for (let i = 0; i < response.zones.length; i++) {
                            const zone = response.zones[i];
                            if ('Unconfigured' !== zone.logicalState && this.zoneTypes[zone.id] !== undefined) {
                                const td = this.zoneTexts[zone.id];

                                this.log.debug('Adding zone ' + td + ' id ' + zone.id + ' ' + zone.physicalState);
                                const zoneType = this.zoneTypes[zone.id];

                                const device = { name: td, id: zone.id, elk: this.elk };

                                switch (zoneType) {
                                    case 'contact':
                                        this.addContact();
                                        break;
                                    case 'ncContact':
                                        this.addContact(device, TamperType.normallyClosed);
                                        break;
                                    case 'noContact':
                                        this.addContact(device, TamperType.normallyOpen);
                                        break;
                                    case 'motion':
                                        this.addMotion(device);
                                        break;
                                    case 'ncMotion':
                                        this.addMotion(device, TamperType.normallyClosed);
                                        break;
                                    case 'noMotion':
                                        this.addMotion(device, TamperType.normallyOpen);
                                        break;
                                    case 'smoke':
                                        this.addSmoke(device);
                                        break;
                                    case 'ncSmoke':
                                        this.addSmoke(device, TamperType.normallyClosed);
                                        break;
                                    case 'noSmoke':
                                        this.addSmoke(device, TamperType.normallyOpen);
                                        break;
                                    case 'garage':
                                        if (this.garageDoors[`${zone.id}`]) {
                                            //          var gd = this.garageDoors[zone.id];
                                            //        newZone = new ElkGarageDoor(Homebridge, this.log, this.elk, gd);
                                        }
                                }
                            }
                        }
                        // this.elk.requestArmingStatus();
                    }).catch((error) => {
                        this.log.error('Error retrieving data from M1 panel');
                        this.log.error(error);
                    });
            });
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

    addInputAccessory(device, inputDesc, inputType: typeof ElkInput, tamperType = TamperType.none) {
        device.displayName = (typeof device.name !== 'undefined') ? device.name :
            `${inputDesc} ${device.id}`;
        const uuidStr = `${inputDesc}${device.id}`;
        this.log.debug(uuidStr);
        const uuid = this.api.hap.uuid.generate(`${inputDesc}${device.id}`);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
            const input = new inputType(this, existingAccessory);
            input.tamperType = tamperType;
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
            input.tamperType = tamperType;
            this.zoneAccessories[device.id] = input;

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addContact(device, tamperType = TamperType.none) {
        this.addInputAccessory(device, 'Contact', ElkContact, tamperType);
    }

    addMotion(device, tamperType = TamperType.none) {
        this.addInputAccessory(device, 'Motion', ElkMotion, tamperType);
    }

    addSmoke(device, tamperType = TamperType.none) {
        this.addInputAccessory(device, 'Smoke', ElkSmoke, tamperType);
    }
}



/*
var Accessory, Service, Characteristic, UUIDGen, Elk, Homebridge, ElkPanel;

var ElkPanel = require('./accessories/ElkPanel.ts');
var ElkContact = require('./lib/ElkContact.js');
var ElkMotion = require('./lib/ElkMotion.js');
var ElkSmoke = require('./lib/ElkSmoke.js');
var ElkOutput = require('./lib/ElkOutput.js');
var ElkTask = require('./lib/ElkTask.js');
var ElkGarageDoor = require('./lib/ElkGarageDoor.js');


module.exports = function (homebridge) {

   Accessory = homebridge.platformAccessory;
   UUIDGen = homebridge.hap.uuid;
   Service = homebridge.hap.Service;
   Characteristic = homebridge.hap.Characteristic;
   Homebridge = homebridge;
   Elk = require('elkmon');

   homebridge.registerPlatform('homebridge-elkm1', 'ElkM1', ElkPlatform);
}

function ElkPlatform(log, config, api) {
   if (!config) {
      log.warn('Ignoring Elk platform setup because it is not configured');
      this.disabled = true;
      return;
   }

   this.config = config;

   this.elkAddress = this.config.elkAddress;
   this.elkPort = this.config.elkPort;
   this.area = this.config.area;
   this.keypadCode = this.config.keypadCode;
   this.secure = this.config.secure;
   this.userName = this.config.userName;
   this.password = this.config.password;
   this.includedTasks = [];
   this.includedOutputs = [];
   if (undefined != this.config.includedTasks) {
      this.includedTasks = this.config.includedTasks;
   }
   if (undefined != this.config.includedOutputs) {
      this.includedOutputs = this.config.includedOutputs;
   }
   if (Array.isArray(this.config.zoneTypes)) {
      var zoneObjects = {};
      for (const zone of this.config.zoneTypes) {
         zoneObjects[zone.zoneNumber] = zone.zoneType;
      }
      this.zoneTypes = zoneObjects;
   } else {
      this.zoneTypes = this.config.zoneTypes;
   }

   this.api = api;
   this._elkAccessories = [];
   this.log = log;
   if (this.secure) {
      this.log.debug("Secure connection");
      this.elk = new Elk(this.elkPort, this.elkAddress,
         {
            secure: true,
            userName: this.userName,
            password: this.password,
            keypadCode: this.keypadCode,
            rejectUnauthorized: false,
            secureProtocol: 'TLS1_method'
         });
   } else {
      this.log.warn("Connection is not secure");
      this.elk = new Elk(this.elkPort, this.elkAddress, { secure: false });
   }
   this.zoneAccessories = {};
   this.garageDoors = {};
   if (this.config.garageDoors) {
      var gd = this.config.garageDoors;
      for (var i = 0; i < gd.length; i++) {
         this.garageDoors[gd[i].stateZone] = gd[i];
      }
   }
}

ElkPlatform.prototype.accessories = function (callback) {

   this.log.info('Connecting to M1');
   this.elk.connect();

   this.elk.on('connected', () => {
      this.log.info('***Connected***');
      this.elk.requestZoneStatusReport()
         .then((response) => {
            this.log.debug("Requesting area description");
            return this.elk.requestTextDescription(this.area, '1')
               .then((areaText) => {
                  this.log.debug(`Area description:${areaText}`);
                  this._elkPanel = new ElkPanel(Homebridge, this.log, areaText.description, this.elk, this.area, this.keypadCode);
                  this._elkAccessories.push(this._elkPanel);
                  this.log.debug("Requesting zone descriptions");
                  return this.elk.requestTextDescriptionAll(0)
               })
               .then((zoneText) => {
                  this.log.debug("Received zone descriptions");
                  this.zoneTexts = {};
                  for (var i = 0; i < zoneText.length; i++) {
                     var td = zoneText[i];
                     this.zoneTexts[td.id] = td.description;
                  }
                  this.log.debug("Requesting task descriptions");
                  return this.elk.requestTextDescriptionAll(5);
               })
               .then((taskText) => {
                  this.log.debug("Received task descriptions");
                  this.tasks = {};
                  for (var i = 0; i < taskText.length; i++) {
                     var td = taskText[i];
                     if (this.includedTasks.includes(td.id)) {
                        var task = new ElkTask(Homebridge, this.log, this.elk, td.id, td.description);
                        this.tasks[td.id] = task;
                        this._elkAccessories.push(task);
                     }
                  }
                  this.log.debug("Requesting output descriptions");
                  return this.elk.requestTextDescriptionAll(4);
               })
               .then((outputText) => {
                  this.outputs = {};
                  this.log.debug("Received output descriptions");
                  for (var i = 0; i < outputText.length; i++) {
                     var td = outputText[i];
                     if (this.includedOutputs.includes(td.id)) {
                        var output = new ElkOutput(Homebridge, this.log, this.elk, td.id, td.description);
                        this.outputs[td.id] = output;
                        this._elkAccessories.push(output);
                     }
                  }
               })
               .then(() => {

                  for (var i = 0; i < response.zones.length; i++) {
                     var zone = response.zones[i];
                     if ('Unconfigured' != zone.logicalState && this.zoneTypes[zone.id] != undefined) {
                        var td = this.zoneTexts[zone.id];
                        this.log.debug("Adding zone " + td + " id " + zone.id + " " + zone.physicalState);
                        var zoneType = this.zoneTypes[zone.id];
                        var newZone = null;

                        switch (zoneType) {
                           case 'contact':
                              newZone = new ElkContact(Homebridge, this.log, zone.id, td);
                              break;
                           case 'motion':
                              newZone = new ElkMotion(Homebridge, this.log, zone.id, td);
                              break;
                           case 'smoke':
                              newZone = new ElkSmoke(Homebridge, this.log, zone.id, td);
                              break;
                           case 'garage':
                              if (this.garageDoors['' + zone.id]) {
                                 var gd = this.garageDoors[zone.id];
                                 newZone = new ElkGarageDoor(Homebridge, this.log, this.elk, gd);
                              }
                        }
                        if (newZone) {
                           this._elkAccessories.push(newZone);
                           this.zoneAccessories[zone.id] = newZone;
                        }
                     }
                  }
                  callback(this._elkAccessories);
                  this.elk.requestArmingStatus();
               }).catch((error) => {
                  this.log.error('Error retrieving data from M1 panel');
                  this.log.error(error);
                  callback([]);
               });
         })
   });

   this.elk.on('ZC', (msg) => {
      this.log.debug(msg);
      var accessory = this.zoneAccessories[msg.id];
      if ('undefined' != typeof accessory) {
         accessory.setStatusFromMessage(msg);
      }
   });

   this.elk.on('CS', (msg) => {
      this.log.debug("CS:");
      this.log.debug(msg);
   });

   this.elk.on('CC', (msg) => {
      this.log.debug(msg);
      var output = this.outputs[msg.id];
      if ('undefined' != typeof output) {
         output.setStatusFromMessage(msg);
      }
   });

   this.elk.on('error', (code) => {
      this.log.error("Error code received from elkmon: " + code);
   });

};*/