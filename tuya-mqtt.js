#!/usr/bin/env node
const fs = require('fs')
const mqtt = require('mqtt')
const json5 = require('json5')
const debug = require('debug')('tuya-mqtt:info')
const debugCommand = require('debug')('tuya-mqtt:command')
const debugError = require('debug')('tuya-mqtt:error')
const SimpleSwitch = require('./devices/simple-switch')
const SimpleDimmer = require('./devices/simple-dimmer')
const RGBTWLight = require('./devices/rgbtw-light')
const GenericDevice = require('./devices/generic-device')
const utils = require('./lib/utils')

var CONFIG = undefined
var tuyaDevices = new Array()
var mqttClient = undefined
var will_topic = undefined

// Setup Exit Handlers
process.on('exit', processExit.bind(null, {}))
process.on('SIGINT', processExit.bind(null, {exitCode: 0}))
process.on('SIGTERM', processExit.bind(null, {exitCode: 0}))
process.on('uncaughtException', processExit.bind(null, {exitCode: 1}))

// Disconnect from and publish offline status for all devices on exit
async function processExit(options, exitReason) {
    for (let tuyaDevice of tuyaDevices) {
        tuyaDevice.device.disconnect()
    }

    const exitCode = (typeof options?.exitCode === 'number') ? options.exitCode : (typeof exitReason === 'number'? exitReason : 2) 

    function printError(...args) {
        if (debugError.enabled) { debugError.apply(this, args); }
        else { console.error.apply(this, args) }
    }
    const printer = (exitCode === 0)? debug : printError;

    await utils.sleep(1)

    printer('Exiting due to: ', exitReason)
    printer('Exit code: ', exitCode)

    process.removeAllListeners('exit') //Deregister self to avoid loop
    process.exit(exitCode)
}

// Get new deivce based on configured type
function getDevice(configDevice, mqttClient) {
    const deviceInfo = {
        configDevice: configDevice,
        mqttClient: mqttClient,
        topic: CONFIG.topic,
        qos: CONFIG.qos,
        retain_status_topic: CONFIG.retain_status_topic,
        publish_homeassistant_discovery: CONFIG.publish_homeassistant_discovery 
    }
    switch (configDevice.type) {
        case 'SimpleSwitch':
            return new SimpleSwitch(deviceInfo)
        case 'SimpleDimmer':
            return new SimpleDimmer(deviceInfo)
        case 'RGBTWLight':
            return new RGBTWLight(deviceInfo)
    }
    return new GenericDevice(deviceInfo)
}

function initDevices(configDevices, mqttClient) {
    for (let configDevice of configDevices) {
        const newDevice = getDevice(configDevice, mqttClient)
        tuyaDevices.push(newDevice)
    }
}

// Republish devices 2x with 30 seconds sleep if restart of HA is detected
async function republishDevices() {
    for (let i = 0; i < 2; i++) {
        debug('Resending device config/state in 30 seconds')
        await utils.sleep(30)
        for (let device of tuyaDevices) {
            device.republish()
        }
        await utils.sleep(2)
    }
}

// Main code function
const main = async() => {
    let configDevices

    try {
        CONFIG = json5.parse(fs.readFileSync('./config.json', 'utf-8'))
    } catch (e) {
        console.error('Configuration file not found!')
        debugError(e)
        process.exit(1)
    }

    if (typeof CONFIG.qos === 'undefined') {
        CONFIG.qos = 1
    }
    if (typeof CONFIG.retain_status_topic === 'undefined') {
        CONFIG.retain_status_topic = false
    }
    if (typeof CONFIG.monitored_birth_topic === 'undefined') {
        CONFIG.monitored_birth_topic = "homeassistant/status"
    }
    if (typeof CONFIG.publish_homeassistant_discovery === 'undefined') {
        CONFIG.publish_homeassistant_discovery = true
    }
    

    try {
        configDevices = fs.readFileSync('./devices.conf', 'utf8')
        configDevices = json5.parse(configDevices)
    } catch (e) {
        console.error('Devices file not found!')
        debugError(e)
        process.exit(1)
    }

    if (!configDevices.length) {
        console.error('No devices found in devices file!')
        process.exit(1)
    }

    will_topic = CONFIG.topic + 'script_status'

    let initialization_complete = false
    mqttClient = mqtt.connect({
        host: CONFIG.host,
        port: CONFIG.port,
        protocol: CONFIG.protocol,
        rejectUnauthorized: CONFIG.rejectUnauthorized,
        username: CONFIG.mqtt_user,
        password: CONFIG.mqtt_pass,
        will: {
          topic: will_topic,
          payload: 'offline', //TODO: add publishing this on clean disconnect as well
          qos: CONFIG.qos,
          retain: CONFIG.retain_status_topic
        }
    })

    mqttClient.on('connect', function (/*connack*/) {
        debug('Connection established to MQTT server')
        initialization_complete = true
        let topic = CONFIG.topic + '#'
        mqttClient.subscribe(topic)

        if( CONFIG.monitored_birth_topic ) {
            mqttClient.subscribe(CONFIG.monitored_birth_topic)
        }
        mqttClient.publish(will_topic, 'online', { qos: CONFIG.qos, retain: CONFIG.retain_status_topic });
        initDevices(configDevices, mqttClient)
    })

    mqttClient.on('reconnect', function () {
        if (mqttClient.connected) {
            debug('Connection to MQTT server lost. Attempting to reconnect...')
        } else {
            debug('Unable to connect to MQTT server')
        }
    })

    mqttClient.on('error', function (error) {
        debugError('Unable to connect to MQTT server', error)
        if (!initialization_complete) {
            processExit({exitCode:3}, 'Unable to connect to MQTT server:' + error.message)
        }
    })

    mqttClient.on('message', function (topic, _message) {
        try {
            const message = _message.toString()
            const splitTopic = topic.split('/')
            const topicLength = splitTopic.length
            const commandTopic = splitTopic[topicLength - 1]
            const deviceTopicLevel = splitTopic[1]
            if(CONFIG.monitored_birth_topic && topic === CONFIG.monitored_birth_topic) {
                debug('Monitored birth state topic [' + topic + '] received message: ' + message)
                if (message === 'online') {
                    republishDevices()
                }
            } else if (commandTopic.includes('command')) {
                // If it looks like a valid command topic try to process it
                debugCommand('Received MQTT message -> ', JSON.stringify({
                    topic: topic,
                    message: message
                }))

                // Use device topic level to find matching device
                const device = tuyaDevices.find(d => d.options.name === deviceTopicLevel || d.options.id === deviceTopicLevel)
		if (device === undefined) {
			debugError("Received command for unrecognized device topic: " + deviceTopicLevel)
		} else {
                    switch (topicLength) {
                        case 3:
                            device.processCommand(message, commandTopic)
                            break;
                        case 4:
                            device.processDpsCommand(message)
                            break;
                        case 5:
                            {
                                const dpsKey = splitTopic[topicLength-2]
                                device.processDpsKeyCommand(message, dpsKey)
                            }
                            break;
                    }
		}
            }
        } catch (e) {
            debugError(e)
        }
    })
}

// Call the main code
main()
