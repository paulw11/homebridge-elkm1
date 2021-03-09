'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkMotion extends ElkInput {

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {
        super(platform, accessory);

        this.service = accessory.getService(platform.Service.MotionSensor) ||
        accessory.addService(platform.Service.MotionSensor);
        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Model, 'Motion zone');

        const itemName = (typeof this.accessory.context.device.name !== 'undefined') ? this.accessory.context.device.name :
            `Motion ${this.accessory.context.device.id}`;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.MotionDetected)
            .onGet(this.getContact.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
            .onGet(this.getTamper.bind(this));
    }

    updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.MotionDetected, state);
    }
}