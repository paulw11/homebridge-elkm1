"use strict";

var Service, Characteristic, uuid;

var ElkOutput = function (homebridge, log, elk, id, name) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.id = id;
    this.elk = elk;

    var itemName = (typeof name !== "undefined") ? name : "";

    this.name = (itemName != "") ? itemName:"Output "+(id+'');;
    this.uuid_base = "output"+this.name;

    this.outputState = false;

    this._service = new Service.Switch(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._onChar = this._service.getCharacteristic(Characteristic.On);

    this._onChar.on('get', (callback) => {
        callback(null, this.outputState);
    });

    this._onChar.on('set', (state,callback) => {
        if (state != this.outputState) {
        if (state) {
            this.elk.setOutputOn(this.id,0);
        } else {
            this.elk.setOutputOff(this.id);
        }
    }
        callback(null,state);
    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'Output')
        .setCharacteristic(Characteristic.SerialNumber, this.id+'');
}

ElkOutput.prototype.setStatusFromMessage = function(message) {
    this.outputState = (message.state == 'On');
    this._service.setCharacteristic(Characteristic.On, this.outputState);
}

ElkOutput.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkOutput;
