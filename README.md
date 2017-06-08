# homebridge-elkm1
## Homebridge plugin for the Elk M1 alarm panel

*homebridge-elkm1* lets you connect homebridge to an [Elk Products M1 Alarm panel](http://www.elkproducts.com/m1_controls.html) via an [M1XEP Ethernet interface](http://www.elkproducts.com/products/elk-m1xep-m1-ethernet-interface)

## Functionality
*homebridge-elkm1* exposes the following functionality via HomeKit:
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

## Configuration

homebridge-elkm1 exposes a *platform* to homebridge, so you need to add it to the `platforms` section of your config.json file.

```
 "platforms": [
        {
            "platform": "ElkM1",
            "name": "ElkM1",
            "elkAddress": "x.x.x.x",
            "elkPort": "2101",
            "area": "1",
            "keypadCode": "1234",
            "zoneTypes": {
                "1": "contact",
                "2": "contact",
                "3": "contact",
                "4": "contact",
                "5": "motion",
                "6": "motion",
                "7": "motion",
                "8": "motion",
                "9": "motion",
                "10": "motion",
                "16": "smoke"
            }
        }
    ]
```

| **name** | **description** |
| ---- | ----------- |
| elkAddress | IP address or hostname of your Elk M1XEP ethernet interface |
| elkPort | The insecure port for your M1XEP; 2101 is the default if you haven't changed it |
| area | The area you want to control; typically 1 |
| keypadCode | A valid keypad code that homebridge-elkm1 can use to arm & disarm your area |
| zoneTypes | A dictionary of zone numbers and their types.  Valid types are: *contact*, *motion* or *smoke* |

You should now be able to start homebridge and see your m1.

## TODO

* Secure connections are not currently supported
* Allow for the definition of a *Garage Door* accessory which is a combination of a zone and an output
