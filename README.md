# homebridge-elkm1

## Homebridge plugin for the Elk M1 alarm panel

*homebridge-elkm1* lets you connect homebridge to an [Elk Products M1 Alarm panel](http://www.elkproducts.com/m1_controls.html) via an [M1XEP Ethernet interface](http://www.elkproducts.com/products/elk-m1xep-m1-ethernet-interface)

## Functionality

* homebridge-elkm1* exposes the following functionality via HomeKit:
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

**Note** Version 2.0 has a change to the `zoneTypes` element of the configuration in order to support the configuration form in Homebridge-UI.  
The old format will be read by verison 2.0, but zones will not appear in the Homebridge UI form until the file configuratiom file is changed.
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
            "elkPort": "2101",
            "area": "1",
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
| garageDoors | An array of garage door objects.  Each garage door has a zone that shows the state of the door (This must be a *garage* zone type), a name, and two outputs; one that is pulsed to open the door and one that is pulsed to close it.  For many openers this will be the same output
| includedTasks | The task numbers that will be added as HomeKit accessories.
| includedOutputs | The outputs that will be added as HomeKit accessories.

You should now be able to start Homebridge and see your M1.

## TODO

* Secure connections are not currently supported
