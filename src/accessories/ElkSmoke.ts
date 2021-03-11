'use strict';

'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkSmoke extends ElkInput {

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {
        super(platform, accessory);
        this.service = accessory.getService(platform.Service.SmokeSensor) ||
        accessory.addService(platform.Service.SmokeSensor);

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Model, 'Smoke zone');

        const itemName = (typeof this.accessory.context.device.name !== 'undefined') ? this.accessory.context.device.name :
            `Smoke ${this.accessory.context.device.id}`;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.SmokeDetected)
            .onGet(this.getContact.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
            .onGet(this.getTamper.bind(this));
    }

    updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.SmokeDetected, state);
    }
}