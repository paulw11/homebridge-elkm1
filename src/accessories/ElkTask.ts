'use strict';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElkM1Platform } from '../platform';
import Elk from 'elkmon';

export class ElkTask {

    private service: Service;
    private elk: Elk;
    private id: number;

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {

        const device = accessory.context.device;

        this.elk = device.elk;
        this.id = device.id;

        this.service = accessory.getService(platform.Service.Switch) ||
            accessory.addService(platform.Service.Switch);

        /* this.contactCharacteristic = platform.Characteristic.ContactSensorState;
        this.tamperCharacteristic = platform.Characteristic.StatusTampered;*/

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Model, 'Task');

        const itemName = (typeof device.name !== 'undefined') ? device.name :
            `Task ${device.id}`;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getTaskState.bind(this))
            .onSet(this.setTaskState.bind(this));
    }

    async getTaskState(): Promise<CharacteristicValue> {
        return new Promise((resolve) => {
            resolve(false);
        });
    }

    async setTaskState(value: CharacteristicValue) {
        const newState = `${value}` === 'true';
        if (newState) {
            this.elk.activateTask(this.id);
            setTimeout(() => {
                this.service.updateCharacteristic(this.platform.Characteristic.On, false);
            }, 1000);
        }
    }
}