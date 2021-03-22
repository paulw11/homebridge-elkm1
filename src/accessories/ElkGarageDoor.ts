'use strict';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElkM1Platform } from '../platform';
import Elk from 'elkmon';

export class ElkGarageDoor {

    protected isOn = false;
    private service: Service;
    private elk: Elk;
    private id: number;
    private openOutput: number;
    private closeOutput: number;
    public readonly stateZone: number;
    public readonly obstructionZone: number;
    public readonly name: string;
    private targetState;
    private currentState;
    private isObstructed = false;

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {

        const device = accessory.context.device;

        this.elk = device.elk;
        this.id = device.id;
        this.targetState = this.platform.Characteristic.TargetDoorState.CLOSED;
        this.currentState = this.platform.Characteristic.CurrentDoorState.CLOSED;
        this.openOutput = device.garageDoor.openOutput;
        this.closeOutput = device.garageDoor.closeOutput;
        if (device.garageDoor.stateZone === undefined) {
            throw new Error('Garage door must have state zone');
        } else {
            this.stateZone = device.garageDoor.stateZone;
        }
        this.obstructionZone = device.garageDoor.obstructionZone;

        this.service = accessory.getService(platform.Service.GarageDoorOpener) ||
            accessory.addService(platform.Service.GarageDoorOpener);

        /* this.contactCharacteristic = platform.Characteristic.ContactSensorState;
        this.tamperCharacteristic = platform.Characteristic.StatusTampered;*/

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ELK')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.openOutput}/${this.closeOutput}/${this.stateZone}`)
            .setCharacteristic(this.platform.Characteristic.Model, 'Garage door');

        const itemName = (typeof device.name !== 'undefined') ? device.name :
            `Garage door ${device.id}`;

        this.name = device.name;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
            .onGet(this.getTargetState.bind(this))
            .onSet(this.setTargetState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
            .onGet(this.getObstructionState.bind(this));

        this.elk.on('ZC', (msg) => {
            if (msg.id === this.obstructionZone) {
                this.setObstructionStatus(msg);
            } else if (msg.id === this.stateZone) {
                this.setState(msg);
            }
        });


    }

    setObstructionStatus(message) {
        this.isObstructed = (message.logicalState !== 'Normal');
        this.service.updateCharacteristic(this.platform.Characteristic.ObstructionDetected, this.isObstructed);
    }

    async getCurrentState(): Promise<CharacteristicValue> {
        return this.currentState;
    }

    async getTargetState(): Promise<CharacteristicValue> {
        return this.targetState;
    }

    async getObstructionState(): Promise<CharacteristicValue> {
        return this.isObstructed;
    }

    async setTargetState(value) {
        this.platform.log.debug(`Asked to set door state to ${value}. Current state=${this.currentState}`);
        if (value != this.currentState) {
            this.targetState = value;
            switch (value) {
                case this.platform.Characteristic.TargetDoorState.OPEN:
                    this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState,
                        this.platform.Characteristic.CurrentDoorState.OPENING);
                    this.elk.setOutputOn(this.openOutput, 1);
                    break;
                case this.platform.Characteristic.TargetDoorState.CLOSED:
                    this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState,
                        this.platform.Characteristic.CurrentDoorState.CLOSING);
                    this.elk.setOutputOn(this.closeOutput, 1);
                    break;
            }
        }
    }

    setState(message) {
        const contactState = (message.logicalState !== 'Normal');
        const newDoorState = contactState ? this.platform.Characteristic.CurrentDoorState.OPEN :
            this.platform.Characteristic.CurrentDoorState.CLOSED;

        if (this.currentState !== newDoorState) {
            this.currentState = newDoorState;
            this.targetState = newDoorState;
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, this.currentState);
            this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.currentState);
        }
    }
}
