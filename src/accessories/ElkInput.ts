'use strict';
import { Service, PlatformAccessory, CharacteristicValue, Characteristic, WithUUID } from 'homebridge';
import { ElkM1Platform } from '../platform';
import { Elk,ZoneChangeUpdate } from 'elkmon2';
import { TamperType } from '../types/types';

/**
 * Abstract base class representing a generic input accessory for the ELK M1 platform.
 * 
 * This class provides the foundational logic for handling contact and tamper states,
 * setting up accessory information, and managing Homebridge/HomeKit characteristics.
 * Derived classes must implement methods to specify the model name, contact characteristic,
 * default name, service initialization, and how to update the contact state.
 * 
 * @template Service - The Homebridge service type associated with the input.
 * @template Characteristic - The Homebridge characteristic type for the contact state.
 * 
 * @remarks
 * - The class expects the accessory context to provide an `elk` instance and a unique `id`.
 * - Tamper handling is configurable via the `tamperType` property.
 * - The class is designed to be extended for specific input types (e.g., zone, sensor).
 * 
 * @example
 * ```typescript
 * class ZoneInput extends ElkInput {
 *   // Implement abstract methods for zone-specific logic
 * }
 * ```
 */
export abstract class ElkInput {

  static INPUT_TYPE = 'Generic Input';

  protected elk: Elk;

  protected contactState = {
    contactState: false,
    tamperState: false,
  };

  protected service?: Service | null = null;
  protected id: number;

  public tamperType: TamperType = TamperType.none;

    // Abstract methods that derived classes must implement
    protected abstract getModelName(): string;
    protected abstract getContactCharacteristic(): WithUUID<{new (): Characteristic}>;
    protected abstract getDefaultName(): string;

    constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
    ) {
      this.elk = this.accessory.context.device.elk;
      this.id = this.accessory.context.device.id;

      // Let derived classes initialize their specific service
      this.initializeService();
      this.setupAccessoryInformation();
      this.setupCharacteristics();
    }

    // This will be overridden by derived classes to set up their specific service
    protected abstract initializeService(): void;

    private setupAccessoryInformation(): void {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ELK')
          .setCharacteristic(this.platform.Characteristic.Model, this.getModelName())
          .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.accessory.context.device.id}`.padStart(4, '0'));
    }

    private setupCharacteristics(): void {
      const itemName = (typeof this.accessory.context.device.name !== 'undefined') 
        ? this.accessory.context.device.name 
        : this.getDefaultName();

        this.service!.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service!.getCharacteristic(this.getContactCharacteristic())
          .onGet(this.getContact.bind(this));

        this.service!.getCharacteristic(this.platform.Characteristic.StatusTampered)
          .onGet(this.getTamper.bind(this));
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

    setStatusFromMessage(message: ZoneChangeUpdate) {
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

    // Each derived class must implement this to update their specific characteristic
    abstract updateContactState(state: boolean): void;

}