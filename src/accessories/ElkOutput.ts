'use strict';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElkM1Platform } from '../platform';
import Elk from 'elkmon';

export class ElkOutput {

    protected isOn = false;
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
            .setCharacteristic(this.platform.Characteristic.Model, 'Output');

        const itemName = (typeof device.name !== 'undefined') ? device.name :
            `Output ${device.id}`;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getOutput.bind(this))
            .onSet(this.setOutput.bind(this));

        this.elk.on('CC', (outputChange) => {
            if (outputChange.id === this.id) {
                const isOn = outputChange.state === 'On';
                if (isOn !== this.isOn) {
                    this.isOn = isOn;
                    this.service.updateCharacteristic(this.platform.Characteristic.On, isOn);
                }
            }
        });


    }

    async getOutput(): Promise<CharacteristicValue> {
        return this.elk.requestOutputStatusReport().then((outputStatusResponse) => {
            const isOn = outputStatusResponse.outputs[this.id - 1] === 'On';
            this.isOn = isOn;
            return isOn;
        })
            .catch((err) => {
                this.platform.log.error(`Caught error (${err}) trying to get current state of output ${this.id}`);
                return this.isOn;
            });
    }

    async setOutput(value: CharacteristicValue) {
        const newState = `${value}` === 'true';
        this.platform.log.debug(`Setting output ${this.id} to ${value}  newState = ${newState} currentState = ${this.isOn}`);
        if (newState !== this.isOn) {
            if (newState) {
                this.elk.setOutputOn(this.id, 0);
            } else {
                this.elk.setOutputOff(this.id);
            }
            this.isOn = newState;
        }
    }
}