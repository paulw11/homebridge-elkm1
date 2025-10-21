# homebridge-elkm1

## Homebridge plugin for the Elk M1 alarm panel

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![BuyMeACoffee](https://img.shields.io/badge/coffee-donate-orange?logo=buy-me-a-coffee&logoColor=yellow)](https://www.buymeacoffee.com/paulw11)
[![PayPal](https://img.shields.io/badge/paypal-donate-blue?logo=paypal)](https://paypal.me/paulwilko/)
[![Downloads](https://img.shields.io/npm/dt/homebridge-elkm1?logo=npm)](https://nodei.co/npm/homebridge-elkm1/)
[![npm (tag)](https://img.shields.io/npm/v/homebridge-elkm1/latest?logo=npm)](https://www.npmjs.com/package/homebridge-elkm1/v/latest)

*homebridge-elkm1* lets you connect homebridge to an [Elk Products M1 Alarm panel](http://www.elkproducts.com/m1_controls.html) via an [M1XEP Ethernet interface](http://www.elkproducts.com/products/elk-m1xep-m1-ethernet-interface)

## Functionality

* *homebridge-elkm1* exposes the following functionality via HomeKit:
* Arm/Disarm the alarm (Stay, Night and Away modes)
* See the status of zones
* Use zone status in HomeKit automation rules
* Control M1 outputs
* Activate M1 tasks

Most configuration items are discovered automatically, however you need to indicate zone types in the configuration file.

## Changes to 4.1

* Updated in preparation for Homebridge 2.0

* Support for multiple areas/partitions.  The `areas` configuration array allows you to specify a keypad code
for each partition/area.

* The "tamper specific" zone types have been removed.  Each zone now allows specification of a `tamperType`

* New zone types: CO, CO2 and leak.


## Configuration

**Note** From version 2.0 there is a change to the `zoneTypes` element of the configuration in order to support the configuration form in Homebridge-UI.  
The old format will be read by verison 2.0 and later, but zones will not appear in the Homebridge UI form until the configuration file is changed.
e.g. from

```json
"zoneTypes": {
    "1":"contact"
}
```

to

```json
"zoneTypes":[
    {
        "zoneNumber":1,
        "zoneType":"contact"
    }
]
```

homebridge-elkm1 exposes a *platform* to homebridge, so you need to add it to the `platforms` section of your config.json file.

```json
 "platforms": [
        {
            "platform": "ElkM1",
            "name": "ElkM1",
            "elkAddress": "x.x.x.x",
            "elkPort": 2601,
            "secure":true,
            "userName":"someUserName",
            "password":"somePassword",
            "areas":[
                {
                    "area": 1,
                    "keypadCode": "1234",
                }
            ],
            "zoneTypes": [{
                "zoneNumber": 1,
                "zoneType": "contact",
                "tamperType":"nc"
            },
            {
                "zoneNumber": 1,
                "zoneType": "contact"
            },
            {
                "zoneNumber": 2,
                "zoneType": "garage"
            },
            {
                "zoneNumber": 3,
                "zoneType": "contact"
            },
            {
                "zoneNumber": 4,
                "zoneType": "motion"
            },
            {
                "zoneNumber": 5,
                "zoneType": "smoke"
            }
            ],
            "garageDoors":[
            {
                "stateZone":"2",
                "obstructionZone":"3",
                "openOutput":"11",
                "closeOutput":"11",
                "name":"Garage door"
            }
            ],
            "includedTasks":[ 1 ],
            "includedOutputs":[ 2 ]
        }
    ]
```

### Configuration Options

| **Name**         | **Description**                                                                                                                                                                                                                                                                                                                                                 |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `elkAddress`     | IP address or hostname of your Elk M1XEP ethernet interface.                                                                                                                                                                                                                                                             |
| `elkPort`        | The insecure port for your M1XEP; `2101` is the default if you haven't changed it.                                                                                                                                                                                                                                       |
| `secure`         | If `true`, use a secure connection to the M1XEP. `2601` is the default secure port.                                                                                                                                                                                                                                      |
| `userName`       | The username used to authenticate to the M1XEP if `secure` is `true`.                                                                                                                                                                                                                                                    |
| `password`       | The password used to authenticate to the M1XEP if `secure` is `true`.                                                                                                                                                                                                                                                    |
| `area`           | The area you want to control; typically `1`. Not required if you use the `areas` array.                                                                                                                                                                                                                                  |
| `keypadCode`     | A valid keypad code that homebridge-elkm1 can use to arm & disarm your area. Not required if you use the `areas` array.                                                                                                                                                                                                  |
| `areas`          | An array of objects, each with an `area` number and a `keypadCode` string.                                                                                                                                                                                                                                               |
| `zoneTypes`      | An array of zone definitions. Each zone has a `zoneNumber`, `zoneType`, and `tamperType`.                                                                                                                                                                                                                                |
| `garageDoors`    | An array of garage door objects. Each garage door has a zone that shows the state of the door (must be a *garage* zone type), an optional zone that indicates when the door is obstructed (should be a `contact` zone type), a name, and two outputs: one pulsed to open and one to close the door (often the same output). |
| `includedTasks`  | The task numbers that will be added as HomeKit accessories.                                                                                                                                                                                                                                                              |
| `includedOutputs`| The outputs that will be added as HomeKit accessories.                                                                                                                                                                                                                                                                   |

### Zone types
Valid zone types are:

| **zone type** | **description**                                   |
|----------------|--------------------------------------------------|
| `contact`      | A contact sensor such as a door or window        |
| `motion`       | A motion sensor                                  |
| `smoke`        | A smoke sensor                                   |
| `co`           | A Carbon Monoxide sensor                         |
| `co2`          | A Carbon Dioxide sensor                          |
| `leak`         | A water leak sensor                              |
| `garage`       | A zone that is used to monitor a garage door     |


### Zone tamper detection

You can define the `tamperType` for each zone.  If `tamperType` is not
specified, then `none` is used.

The following tamper types are available:
| **tamper type** | **description**                 |
|-----------------|---------------------------------|
| nc              | A normally closed tamper        |
| no              | A normally open tamper          |
| none            | Tamper is not used (default)    |

## Tasks
You can include tasks using the `includedTasks` configuration array.  These will be exposed to Homebridge as a switch.  
When the switch is activated, it will trigger the task on the M1 and then turn off after one second.

## Outputs
You can include M1 outputs using the `includedOutputs` configration array. These will be exposed to Homebridge as a switch that
controls the M1 output directly.

## Elk M1 Panel set up

In order for Homebridge-elkm1 to receive zone updates from your panel, you need to ensure that the
Serial Port 0 Transmit Options are set correctly using ElkRP; You need to enable at least zone and output changes.

![Serial options screenshot](https://user-images.githubusercontent.com/6835876/112089001-ee322480-8be4-11eb-82a6-daa9146ee68f.png)

