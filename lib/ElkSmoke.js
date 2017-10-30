"use strict";

var Service, Characteristic, uuid;

var ElkSmoke = function (homebridge, log, id, name) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.id = id;
    this.name = this.name = (name != "") ? name:"Contact "+(id+'');;
    this.uuid_base = "smoke"+name;

    this.smokeState = false;
    this.tamperedState = false;

    this._service = new Service.SmokeSensor(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._stateChar = this._service.getCharacteristic(Characteristic.SmokeDetected);
    this._tamperedChar = this._service.getCharacteristic(Characteristic.StatusTampered);

    this._stateChar.on('get', (callback) => {
        callback(null, this.smokeState);
    });

    this._tamperedChar.on('get', (callback) => {
        callback(null, this.tamperedState);
    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'Smoke Detector')
        .setCharacteristic(Characteristic.SerialNumber, this.id+'');
}

ElkSmoke.prototype.setStatusFromMessage = function(message) {
    this.motionState = (message.logicalState != 'Normal');
    this._service.setCharacteristic(Characteristic.SmokeDetected, this.smokeState);
}

ElkSmoke.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkSmoke;
