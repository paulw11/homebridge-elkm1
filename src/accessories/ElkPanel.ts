'use strict';

import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElkM1Platform } from '../platform';
import { ArmingStatusReport, AreaReport, ArmMode, Elk } from 'elkmon2';

export class ElkPanel {
  private service: Service;
  private elk: Elk;
  private area: number;
  private targetState: number;
  private currentState: number;
  private keypadCode: string;

  private readonly DISARM_DELAY = 2000;

  constructor(
    protected readonly platform: ElkM1Platform,
    protected readonly accessory: PlatformAccessory,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ELK')
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        `${accessory.context.device.id}`.padStart(4, '0'),
      );

    const device = accessory.context.device;

    this.elk = device.elk;
    this.area = device.area;
    this.keypadCode = device.keypadCode;

    this.targetState =
      this.platform.Characteristic.SecuritySystemTargetState.DISARM;
    this.currentState =
      this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;

    this.service =
      accessory.getService(platform.Service.SecuritySystem) ||
      accessory.addService(platform.Service.SecuritySystem);

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ELK')
      .setCharacteristic(this.platform.Characteristic.Model, 'ELK M1')
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        `${device.area}`.padStart(6, '0'),
      );

    this.service
      .getCharacteristic(
        this.platform.Characteristic.SecuritySystemCurrentState,
      )
      .onGet(this.getCurrentState.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    this.elk.on('AS', (armStatusMsg: ArmingStatusReport) => {
      const areaReport = armStatusMsg.areas[this.area - 1];
      this.platform.log.debug(`Alarm state = ${areaReport.alarmState}`);
      const armStatus = this.hkStatusFromElkStatus(areaReport);

      this.currentState = armStatus;
      this.service.setCharacteristic(
        this.platform.Characteristic.SecuritySystemCurrentState,
        armStatus,
      );
      if (
        armStatus !==
        this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
      ) {
        this.targetState = armStatus;
      }
    });
  }

  async getCurrentState(): Promise<number> {
    try {
      const armStatusMsg = await this.elk.requestArmingStatus();
      const areaReport = armStatusMsg.areas[this.area - 1];
      this.platform.log.debug(`Alarm state = ${areaReport.alarmState}`);
      const armStatus = this.hkStatusFromElkStatus(areaReport);
      this.currentState = armStatus;
      return armStatus;
    } catch (err) {
      this.platform.log.error(
        `Caught error (${err}) trying to get current state of panel`,
      );
    }
    return this.currentState;
  }

  getTargetState(): number {
    return this.targetState;
  }

  async setTargetState(value: CharacteristicValue) {
    let elkState: ArmMode = ArmMode.Disarm;
    this.platform.log.debug(
      `Set alarm target state = ${value}  Current state = ${this.currentState}`,
    );
    if (
      this.currentState !==
        this.platform.Characteristic.SecuritySystemCurrentState.DISARMED &&
      value === this.platform.Characteristic.SecuritySystemTargetState.DISARM
    ) {
      this.platform.log.debug(
        `Disarming area ${this.area} with keycode ${this.keypadCode} before re-arming`,
      );
      this.elk.arm(this.area, ArmMode.Disarm, this.keypadCode);
      await new Promise(resolve => setTimeout(resolve, this.DISARM_DELAY));

    }
    if (value !== this.currentState) {
      this.targetState = value as number;
      switch (value) {
      case this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM:
        elkState = ArmMode.ArmedStay;
        break;
      case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM:
        elkState = ArmMode.ArmedAway;
        break;
      case this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        elkState = ArmMode.ArmedNight;
        break;
      case this.platform.Characteristic.SecuritySystemTargetState.DISARM:
        elkState = ArmMode.Disarm;
        break;
      }
      this.platform.log.debug(
        `Arming area ${this.area} to ${elkState} keycode ${this.keypadCode}`,
      );
      this.platform.log.info(`Setting area ${this.area} to ${ArmMode[elkState]}`);
      this.elk.arm(this.area, elkState, this.keypadCode);
    }
  }

  private hkStatusFromElkStatus(area: AreaReport): number {
    let armStatus: number =
      this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;
    if (area.alarmState === 'No Alarm Active') {
      switch (area.armStatus) {
      case 'Disarmed':
        armStatus =
            this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;
        break;
      case 'Armed Away':
      case 'Armed Vacation':
        armStatus =
            this.platform.Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        break;
      case 'Armed Stay':
      case 'Armed Stay Instant':
        armStatus =
            this.platform.Characteristic.SecuritySystemCurrentState.STAY_ARM;
        break;
      case 'Armed Night':
      case 'Armed Night Instant':
        armStatus =
            this.platform.Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
        break;
      }
    } else {
      armStatus =
        this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
    }
    return armStatus;
  }
}
