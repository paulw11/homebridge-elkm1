"use strict";

var Service, Characteristic, uuid;

var ElkGarageDoor = function (homebridge, log, elk, config) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.log.debug(config);
    this.id = config.stateZone;
    this.openOutput = config.openOutput;
    this.closeOutput = config.closeOutput;
    this.elk = elk;
    this.name = config.name;
    this.uuid_base = "garage" + this.name;

    this.targetState = Characteristic.TargetDoorState.CLOSED;
    this.currentState = Characteristic.CurrentDoorState.CLOSED;


    this._service = new Service.GarageDoorOpener(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._currentStateChar = this._service.getCharacteristic(Characteristic.CurrentDoorState);
    this._targetStateChar = this._service.getCharacteristic(Characteristic.TargetDoorState);
    this._service.setCharacteristic(Characteristic.CurrentDoorState, this.currentState);
    this._service.setCharacteristic(Characteristic.TargetDoorState, this.targetState);

    this._currentStateChar.on('get', (callback) => {
        this.log.debug("Asked about currentState");
        callback(null, this.currentState);
    });

    this._targetStateChar.on('get', (callback) => {
        this.log.debug("Asked about target state");
        callback(null, this.targetState);
    });

    this._targetStateChar.on('set', (state, callback) => {
        this.log.debug('asked to set door state to '+state+' Current state='+this.currentState);
        if (state != this.currentState) {
            this.targetState = state;
            switch (state) {
                case Characteristic.TargetDoorState.OPEN:
                    this._service.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPENING);
                    this.elk.setOutputOn(this.openOutput, 0);
                    setTimeout(function() {
                        this.elk.setOutputOff(this.openOutput);
                    }.bind(this),1000);
                    break;
                case Characteristic.TargetDoorState.CLOSED:
                    this._service.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSING);
                    this.elk.setOutputOn(this.closeOutput, 0);
                    setTimeout(function() {
                        this.elk.setOutputOff(this.closeOutput);
                    }.bind(this),1000);
                    break;
            }
        }
        callback(null, state);


    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'Garage Door')
        .setCharacteristic(Characteristic.SerialNumber, this.id);
}

ElkGarageDoor.prototype.setStatusFromMessage = function (message) {
    this.log.debug("Garage door setting state from message "+message.physicalStatus);
    var contactState = (message.physicalStatus == 'Violated');
    var newDoorState = Characteristic.CurrentDoorState.CLOSED;
    if (contactState) {
        newDoorState = Characteristic.CurrentDoorState.OPEN;
    }
    if (this.currentState != newDoorState) {
        this.currentState = newDoorState;
        this.targetState = newDoorState;
        this._service.setCharacteristic(Characteristic.CurrentDoorState, newDoorState);
        this._service.setCharacteristic(Characteristic.TargetDoorState, newDoorState);
    }
}

ElkGarageDoor.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkGarageDoor;
