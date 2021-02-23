"use strict";

var Accessory, Service, Characteristic, UUIDGen, Elk, Homebridge, ElkPanel;

var ElkPanel = require('./lib/ElkPanel.js');
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
                            var task = new ElkTask(Homebridge, this.log, this.elk, td.id, td.description);
                            this.tasks[td.id] = task;
                            this._elkAccessories.push(task);
                        }
                        this.log.debug("Requesting output descriptions");
                        return this.elk.requestTextDescriptionAll(4);
                    })
                    .then((outputText) => {
                        this.outputs = {};
                        this.log.debug("Received output descriptions");
                        for (var i = 0; i < outputText.length; i++) {
                            var td = outputText[i];
                            var output = new ElkOutput(Homebridge, this.log, this.elk, td.id, td.description);
                            this.outputs[td.id] = output;
                            this._elkAccessories.push(output);
                        }
                    })
                    .then(() => {

                        for (var i = 0; i < response.zones.length; i++) {
                            var zone = response.zones[i];
                            if ('Unconfigured' != zone.logicalState && this.zoneTypes[zone.id] != undefined) {
                                var td = this.zoneTexts[zone.id];
                                this.log.debug("Zone " + td + " id " + zone.id + " " + zone.physicalState);
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
                    }) .catch((error) => {
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
	this.log.error("Error code received from elkmon: "+code);
    });

};