# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [3.0.4-mod.mbronk2]
Forked from upstream at Feb 2022. The changelist below reflects changes vs. original 3.0.4 upstream version

### Added
- deviceName/status topic can now be set to retained (available also after tuya-mqtt exit). Refer to https://github.com/TheAgentK/tuya-mqtt/issues/52 for description and rationale
- QOS setting is configurable
- Added Last Will or Testament (LWT) topic for tuya-mqtt (tuya/script_status) which reports `online` when the script is running (and `offline` -  otherwise). Guaranteed to publish `offline` message also on script crash (mqtt broker functionality).
- Added configuration of the monitored 'birth' channell which causes device data re-publish. Uses HomeAssistant's value by default. Set to empty to disable. For OpenHab, particularly useful with https://github.com/openhab/openhab-addons/pull/12152 incorporated.
- Added configurable option for publishing HomeAssistant discovery state (default true)
- Node runtime version requirement set to v14 min (due to use of optional chaining operator) & matching npm v6 min

## Changed
- Fixes to support white-only Tuya lights (w/o 'color' DPS)
- Dependencies updated to latest-available (as of 2/6/2022)
- Housekeeping (added ESlint config, devices.conf sample, VSCode launch file, etc.)
- Fixed minor ESLint errors && updated at-exit handler to print stacktrace on error (and fallback to console if not running with debug enabled) 

## [3.0.0]
The 3.0.0 release is a major refactor of the project with significant changes from previous version.  Only major additions and changes are listed below.
### Added
- Added templating engine for mapping device DPS value to friendly topics
- Added pre-defined template for common devices
- Command topics for DPS keys

### Changed
- Configuration for devices is now via devices.conf file (based on output format of 'tuya-cli wizard' command)
- Default device presents only raw DPS data
- Commands sent only via MQTT messages to command topics
- Updates all libraries to latest version

### Removed
- Topic based configuraiton has been removed

## [2.1.0]
### Added
- Added ability to update validate communicaton with device and update state topic by issuing { "schema": true } command
- Added support for protocol 3.3 either via automatic device discovery or manual specification when using IP address

### Changed
- Can specify "discover" instead of IP address to automatically find device (only works if device on same IP subnet as system running this script).  This mode will also automatically detect 3.1 and 3.3 protocol devices
- Can manually specific protocol via ver3.1/ver3.3 in topic line after tuya/
- Bump Tuyapi version to v5.3.x
- Bump MQTT version to v4.x.x
- Moved openHAB config to it's own document since many users use this with other tools
- Verious other fixes and cleanups

## [2.0.1]
### Added
- Added capability to set multiple dps values over MQTT-Command
- Custom Set-Function for TuyAPI-Class (added error handling for "index [1] not found" error)

### Changed
- MQTT-Topic no longer requires a device type
- Updated TuyAPI to v4.x.x

### Removed
- remove device type from topic

## [2.0.0]
### Added
- support for OH MQTT-Binding 2.4
- default QoS of 2, if not set through config.json

### Changed
- Updated TuyAPI to v3.x.x
- Constant off states after start #11

### Removed
- custom set function for TuyAPI

## [1.0.0]
### Added
- Add ability to connect to protected MQTT server
- Added seperate configuration file

### Changed
- TuyAPI repository not found

### Removed
