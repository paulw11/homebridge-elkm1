'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkMotion extends ElkInput {

  static INPUT_TYPE = 'Motion';

  protected initializeService(): void {
    this.service = this.accessory.getService(this.platform.Service.MotionSensor) ||
            this.accessory.addService(this.platform.Service.MotionSensor);
  }

  protected getModelName(): string {
    return 'Motion zone';
  }

  protected getContactCharacteristic() {
    return this.platform.Characteristic.MotionDetected;
  }

  protected getDefaultName(): string {
    return `Motion ${this.accessory.context.device.id}`;
  }

  constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
  }

  updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.MotionDetected, state);
  }
}