"use strict";

var Service, Characteristic, uuid;

var ElkContact = function (homebridge, log, id, name) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.id = id;
    this.name = name;
    this.uuid_base = "contact"+name;

    this.contactState = false;
    this.tamperedState = false;

    this._service = new Service.ContactSensor(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._stateChar = this._service.getCharacteristic(Characteristic.ContactSensorState);
    this._tamperedChar = this._service.getCharacteristic(Characteristic.StatusTampered);

    this._stateChar.on('get', (callback) => {
        callback(null, this.contactState);
    });

    this._tamperedChar.on('get', (callback) => {
        callback(null, this.tamperedState);
    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'Contact zone')
        .setCharacteristic(Characteristic.SerialNumber, this.id+'');
}

ElkContact.prototype.setStatusFromMessage = function(message) {
    this.contactState = (message.logicalStatus == 'Violated');
    this._service.setCharacteristic(Characteristic.ContactSensorState, this.contactState);
}

ElkContact.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkContact;
