'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkSmoke extends ElkInput {

  static INPUT_TYPE = 'Smoke';

  protected initializeService(): void {
    this.service = this.accessory.getService(this.platform.Service.SmokeSensor) ||
            this.accessory.addService(this.platform.Service.SmokeSensor);
  }

  protected getModelName(): string {
    return 'Smoke zone';
  }

  protected getContactCharacteristic() {
    return this.platform.Characteristic.SmokeDetected;
  }

  protected getDefaultName(): string {
    return `Smoke ${this.accessory.context.device.id}`;
  }

  constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
  }

  updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.SmokeDetected, state);
  }
}