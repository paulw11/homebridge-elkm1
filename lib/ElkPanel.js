"use strict";

var Service, Characteristic, uuid;

var ElkPanel = function (homebridge, log, name, elk, area, keypadCode) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    this.log = log;
    this.elk = elk;
    this.area = area;
    this.keypadCode = keypadCode;
    this.name = name;
    this.uuid_base = name;
    this.targetState = Characteristic.SecuritySystemTargetState.DISARMED;
    this.currentState = Characteristic.SecuritySystemCurrentState.DISARMED;

    this._service = new Service.SecuritySystem(this.name);
    this._informationService = new Service.AccessoryInformation();

    this._currentStateChar = this._service.getCharacteristic(Characteristic.SecuritySystemCurrentState);
    this._targetStateChar = this._service.getCharacteristic(Characteristic.SecuritySystemTargetState);

    this._currentStateChar.on('get', (callback) => {
        this.elk.requestArmingStatus().then((armStatusMsg) => {
            var area = armStatusMsg.areas[this.area - 1];
            this.log.debug(area);
            var armStatus = this.HKStatusFromElkStatus(area);
            callback(null, armStatus);
        });
    });
    this._targetStateChar.on('get', (callback) => {
        callback(null, this.targetState);
    });

    this._targetStateChar.on('set', (state, callback) => {
        var elkState;
        if (state != this.currentState) {
            this.targetState = state;
            switch (state) {
                case Characteristic.SecuritySystemTargetState.STAY_ARM:
                    elkState = 2;
                    break;
                case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                    elkState = 1;
                    break;
                case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                    elkState = 4;
                    break;
                case Characteristic.SecuritySystemTargetState.DISARM:
                    elkState = 0;
                    break;
            }

            this.elk.arm(this.area, elkState, this.keypadCode);
        }
        callback(null);


    });

    this._informationService.setCharacteristic(Characteristic.Manufacturer, 'Elk')
        .setCharacteristic(Characteristic.Model, 'M1')
        .setCharacteristic(Characteristic.SerialNumber, '');

    this.elk.on('AS', (armStatusMsg) => {
        var area = armStatusMsg.areas[this.area - 1];
        this.log.debug(area);
        var armStatus = this.HKStatusFromElkStatus(area);
       
        this.currentState = armStatus;
        this._service.setCharacteristic(Characteristic.SecuritySystemCurrentState, armStatus);
        if (armStatus != Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
            this.targetState = armStatus;
            this._service.setCharacteristic(Characteristic.SecuritySystemTargetState, armStatus);
        }
    });

}

ElkPanel.prototype.HKStatusFromElkStatus = function (area) {
    var armStatus;
    if (area.alarmState == 'No Alarm Active') {
        switch (area.armStatus) {
            case 'Disarmed':
                armStatus = Characteristic.SecuritySystemCurrentState.DISARMED;
                break;
            case 'Armed Away':
            case 'Armed Vacation':
                armStatus = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
                break;
            case 'Armed Stay':
            case 'Armed Stay Instant':
                armStatus = Characteristic.SecuritySystemCurrentState.STAY_ARM;
                break;
            case 'Armed Night':
            case 'Armed Night Instant':
                armStatus = Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
                break;
        }
    } else {
        armStatus = Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
    }
    return armStatus;
}

ElkPanel.prototype.getServices = function () {
    return [this._informationService, this._service];
}

module.exports = ElkPanel;
