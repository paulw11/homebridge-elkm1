"use strict";

var Service, Characteristic, uuid;

var ElkTask = function (homebridge, log, elk, id, name) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.id = id;
    this.elk = elk; 
    var itemName = (typeof name !== "undefined") ? name : "";
    this.name = this.name = (itemName != "") ? itemName:"Task "+(id+'');;
    this.uuid_base = "task"+this.name;

    this._service = new Service.Switch(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._onChar = this._service.getCharacteristic(Characteristic.On);

    this._onChar.on('get', (callback) => {
        callback(null, false);
    });

    this._onChar.on('set', (state,callback) => {
        if (state) {
           this.elk.activateTask(this.id);
           setTimeout(function() {
               this._service.setCharacteristic(Characteristic.On, false);
           }.bind(this), 1000);
        }
        callback(null,true);
    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'Task')
        .setCharacteristic(Characteristic.SerialNumber, this.id+'');
}

ElkTask.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkTask;
