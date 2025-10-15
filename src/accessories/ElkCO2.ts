'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkCO2 extends ElkInput {

  static INPUT_TYPE = 'CO2';

  protected initializeService(): void {
    this.service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) ||
            this.accessory.addService(this.platform.Service.CarbonDioxideSensor);
  }

  protected getModelName(): string {
    return 'CO2 zone';
  }

  protected getContactCharacteristic() {
    return this.platform.Characteristic.CarbonDioxideDetected;
  }

  protected getDefaultName(): string {
    return `CO2 ${this.accessory.context.device.id}`;
  }

  constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
  }

  updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, state);
  }
}