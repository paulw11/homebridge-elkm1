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

## Installation

1. Install homebridge - `sudo npm install -g --unsafe-perm homebridge`
2. Install homebridge-elkm1 - `sudo npm install -g --unsafe-perm homebridge-elkm1`
3. Update your configuration file.  There is a sample file in this repository.

**Note** Your node.js must be version 6 or later in order for this plugin to work.  If you get a syntax error on startup, you
probably need to upgrade your Node.js

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
            "elkPort": 2101,
            "area": 1,
            "keypadCode": "1234",
            "zoneTypes": [{
                "zoneNumber": 1,
                "zoneType": "contact"
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

| **name** | **description** |
| ---- | ----------- |
| elkAddress | IP address or hostname of your Elk M1XEP ethernet interface |
| elkPort | The insecure port for your M1XEP; 2101 is the default if you haven't changed it |
| area | The area you want to control; typically 1 |
| keypadCode | A valid keypad code that homebridge-elkm1 can use to arm & disarm your area |
| zoneTypes | An array of zone definitions.  Each zone has a `zoneNumber` and a `zoneType`.  Valid types are: *contact*, *motion*, *smoke* or *garage* |
| garageDoors | An array of garage door objects.  Each garage door has a zone that shows the state of the door (This must be a *garage* zone type), an optional zone that indicates when the door is obstructed (This should be a *contact* zone type) a name, and two outputs; one that is pulsed to open the door and one that is pulsed to close it.  For many openers this will be the same output
| includedTasks | The task numbers that will be added as HomeKit accessories.
| includedOutputs | The outputs that will be added as HomeKit accessories.

You should now be able to start Homebridge and see your M1.

## Zone tamper detection

New in version 3.0.0 is the ability to monitor the tamper status of zones by defining them as normally open or normally closed.
Tamper protection requires end-of-line resistors to be installed appropriately in your alarm sensors.

The following zone types are available:
| **zone type** | **description**                   |
|---------------|-----------------------------------|
| ncContact     | A normally closed contact         |
| noContact     | A normally open contact           |
| ncMotion      | A normally closed motion detector |
| noMotion      | A normally open motion detector   |
| ncSmoke       | A normally closed smoke detector  |
| noSmoke       | A normally open smoke detector    |

## TODO

* [Secure connections do not work at this time.](https://github.com/paulw11/homebridge-elkm1/issues/16)
