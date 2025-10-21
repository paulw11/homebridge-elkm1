'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkLeak extends ElkInput {

  static INPUT_TYPE = 'Leak';

  protected initializeService(): void {
    this.service = this.accessory.getService(this.platform.Service.LeakSensor) ||
            this.accessory.addService(this.platform.Service.LeakSensor,

            );
  }

  protected getModelName(): string {
    return 'Water leak zone';
  }

  protected getContactCharacteristic() {
    return this.platform.Characteristic.LeakDetected;
  }

  protected getDefaultName(): string {
    return `Leak ${this.accessory.context.device.id}`;
  }

  constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
  }

  updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.LeakDetected, state);
  }
}