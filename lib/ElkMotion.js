"use strict";

var Service, Characteristic, uuid;

var ElkMotion = function (homebridge, log, id, name) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.id = id;
    var itemName = (typeof name !== "undefined") ? name : "";

    this.name = (itemName != "") ? itemName:"Motion "+(id+'');
    this.uuid_base = "Motion"+this.name;

    this.motionState = false;
    this.tamperedState = false;

    this._service = new Service.MotionSensor(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._stateChar = this._service.getCharacteristic(Characteristic.MotionDetected);
    this._tamperedChar = this._service.getCharacteristic(Characteristic.StatusTampered);

    this._stateChar.on('get', (callback) => {
        callback(null, this.motionState);
    });

    this._tamperedChar.on('get', (callback) => {
        callback(null, this.tamperedState);
    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'Motion Zone')
        .setCharacteristic(Characteristic.SerialNumber, this.id+'');
}

ElkMotion.prototype.setStatusFromMessage = function(message) {
    this.motionState = (message.logicalState != 'Normal');
    this._service.setCharacteristic(Characteristic.MotionDetected, this.motionState);
}

ElkMotion.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkMotion;
