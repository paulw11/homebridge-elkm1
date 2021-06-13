'use strict';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElkM1Platform } from '../platform';
import Elk from 'elkmon';

export enum TamperType {
    none = 'None',
    normallyOpen = 'NO',
    normallyClosed = 'NC',
}

export class ElkInput {

    protected elk: Elk;

    protected contactState = {
        contactState: false,
        tamperState: false,
    };

    protected service: Service | null = null;
    protected id: number;

    public tamperType: TamperType = TamperType.none;

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {

        this.elk = this.accessory.context.device.elk;
        this.id = this.accessory.context.device.id;

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ELK')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `${accessory.context.device.id}`.padStart(4, '0'));

    }

    async getContact(): Promise<CharacteristicValue> {
        const contactState = this.contactState.contactState;
        this.platform.log.debug('Get contact state ->', contactState);
        return contactState;
    }

    async getTamper(): Promise<CharacteristicValue> {
        const tamperState = this.contactState.tamperState;
        this.platform.log.debug('Get tamper state ->', tamperState);
        return tamperState;
    }

    setStatusFromMessage(message) {
        this.contactState.contactState = ('Normal' !== message.logicalState);
        switch (this.tamperType) {
            case TamperType.none:
                this.contactState.tamperState = false;
                break;
            case TamperType.normallyClosed:
                this.contactState.tamperState = ('Short' === message.physicalStatus);
                break;
            case TamperType.normallyOpen:
                this.contactState.tamperState = ('Open' === message.physicalStatus);
                break;
        }
        this.platform.log.debug('Update contact state ->', this.contactState.contactState);
        this.updateContactState(this.contactState.contactState);
        this.platform.log.debug('Update tamper state ->', this.contactState.tamperState);
        this.service!.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.contactState.tamperState);
    }

    updateContactState(state: boolean) {
        this.service!.updateCharacteristic(this.platform.Characteristic.ContactSensorState, state);
    }

}