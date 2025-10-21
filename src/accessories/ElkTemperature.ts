'use strict';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElkM1Platform } from '../platform';
import { Elk, TemperatureReply } from 'elkmon2';


export class ElkTemperature {

  private service: Service;
  private elk: Elk;
  private id: number;
  public readonly name: string;
  private currentTemperature = 0;

  constructor(
        protected readonly platform: ElkM1Platform,
        protected readonly accessory: PlatformAccessory,
  ) {

    const device = accessory.context.device;

    this.elk = device.elk;
    this.id = device.id;
    this.currentTemperature = 0;


    this.service = accessory.getService(platform.Service.TemperatureSensor) ||
            accessory.addService(platform.Service.TemperatureSensor);

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ELK')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, `M1TZS-${this.id}`)
          .setCharacteristic(this.platform.Characteristic.Model, 'ELK-M1ZTS');

        const itemName = (typeof device.name !== 'undefined') ? device.name :
          `Temperature Sensor ${device.id}`;

        this.name = device.name;

        this.service.setCharacteristic(this.platform.Characteristic.Name, itemName);

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .onGet(this.getCurrentTemperature.bind(this));

        this.elk.on('LW', (msg: TemperatureReply  ) => {
          const temperatureF = msg.zones[this.id - 1];
          const temperatureC = (temperatureF - 32) * 5.0 / 9.0;
          this.currentTemperature = Math.round(temperatureC * 10) / 10;
          this.platform.log.debug(`Temperature for zone ${this.id} is ${this.currentTemperature}°C (${temperatureF}°F)`);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemperature);
        });
        
  }


  async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.currentTemperature;
  }

}
