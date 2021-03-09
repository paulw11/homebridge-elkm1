'use strict';
import { PlatformAccessory } from 'homebridge';
import { ElkInput } from './ElkInput';
import { ElkM1Platform } from '../platform';

export class ElkContact extends ElkInput {

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {
        super(platform, accessory);
        this.service = accessory.getService(platform.Service.ContactSensor) ||
        accessory.addService(platform.Service.ContactSensor);

        /* this.contactCharacteristic = platform.Characteristic.ContactSensorState;
        this.tamperCharacteristic = platform.Characteristic.StatusTampered;*/

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Model, 'Contact zone');

        const itemName = (typeof this.accessory.context.device.name !== 'undefined') ? this.accessory.context.device.name :
            `Contact ${this.accessory.context.device.id}`;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
            .onGet(this.getContact.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
            .onGet(this.getTamper.bind(this));
    }
}