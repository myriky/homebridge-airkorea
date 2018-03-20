'use strict';

const firmware = require('./package.json').version;
const request = require('request');

var Service;
var Characteristic;

function AirKoreaAccessory(log, config) {
    this.log = log;
    this.name = config.show_last_updated_date ? this.getDateString() : config.name;
    this.key = config.api_key;
    this.sensor = config.sensor || 'air_quality';
    this.station = config.station;
    this.show_last_updated_date = config.show_last_updated_date || false;
    this.polling = config.polling || false;
    this.interval = config.interval * 60 * 1000;

    if (!this.key) {
        throw new Error('API key not specified');
    }
    if (!this.sensor) {
        this.log.error('Unsupported sensor specified, defaulting to air quality');
        this.sensor = 'air_quality';
    }
    if (!this.station) {
        throw new Error('station is not specified');
    }
    if (!([true, false].indexOf(this.polling) > -1)) {
        this.log.error('Unsupported option specified for polling, defaulting to false');
        this.polling = false;
    }
    if (!this.interval) {
        this.log.error('interval is not specified, defaulting to 60');
        this.interval = 60 * 60 * 1000;
    }

    if (this.polling) {
        var that = this;
        setTimeout(function () {
            that.servicePolling();
        }, that.interval);
    }

    this.log.debug('Polling is %s', (this.polling) ? 'enabled' : 'disabled');

    this.conditions = {};
}

AirKoreaAccessory.prototype = {

    servicePolling: function () {
        this.log.debug('Polling');
        this.getData(function (conditions) {
            var that = this;
            switch (that.sensor) {
                case 'air_quality':
                default:
                    that.sensorService.setCharacteristic(
                        Characteristic.AirQuality,
                        conditions.air_quality
                    );
                    break;
            }
            setTimeout(function () {
                that.servicePolling();
            }, that.interval);
        }.bind(this));
    },

    getAirQuality: function (callback) {
        this.getData(function (conditions) {
            callback(null, conditions.air_quality);
        });
    },


    getData: function (callback) {
        var that = this;
        var url = 'http://openapi.airkorea.or.kr/openapi/services/rest/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?stationName=' +                   encodeURIComponent(that.station) + '&dataTerm=month&pageNo=1&numOfRows=1&ServiceKey=' + that.key + '&_returnType=json'

        request({
            url: url,
            json: true
        }, function (error, response, data) {
            if (!error) {
                switch (response.statusCode) {
                    case 200:

                        that.log.debug('Time is: %s', data.list[0].dataTime);

                        if(that.show_last_updated_date) {
                            var date = new Date(data.list[0].dataTime);

                            var date_str = that.getDateString(date);

                            that.sensorService
                                .getCharacteristic(Characteristic.Name)
                                .setValue(date_str); 

                            that.log.debug('change title => %s', date_str);
                        }

                        that.log.debug('Station is: %s', data.parm.stationName);

                        switch (that.sensor) {
                            case 'air_quality':
                            default:
                                if( data.list[0].khaiValue != "-" ) {
                                    that.conditions.aqi = parseFloat(data.list[0].khaiValue);
                                    that.conditions.air_quality = that.convertGrade(data.list[0].khaiValue);
                                    that.log.debug('Current aqi value is: %s', that.conditions.aqi);
                                    that.log.debug('Current aqi grade is: %s', that.conditions.air_quality);
                                }
                                else {
                                    that.conditions.aqi = NaN;
                                    that.conditions.air_quality = NaN;
                                }

                                if (data.list[0].pm10Value != "-") {
                                    that.conditions.pm10 = parseFloat(data.list[0].pm10Value);
                                    that.log.debug('Current PM10 density is: %s', that.conditions.pm10);
                                    that.sensorService
                                        .getCharacteristic(Characteristic.PM10Density)
                                        .setValue(that.conditions.pm10); 
                                }
                                if (data.list[0].pm25Value != "-") {
                                    that.conditions.pm25 = parseFloat(data.list[0].pm25Value);
                                    that.log.debug('Current PM25 density is: %s', that.conditions.pm25);
                                    that.sensorService
                                        .getCharacteristic(Characteristic.PM2_5Density)
                                        .setValue(that.conditions.pm25); 
                                }
                                if (data.list[0].o3Value != "-") {
                                    that.conditions.o3 = parseFloat(data.list[0].o3Value) * 1000;
                                    that.log.debug('Current Ozon density is: %s', that.conditions.o3);
                                    that.sensorService
                                        .getCharacteristic(Characteristic.OzoneDensity)
                                        .setValue(that.conditions.o3); 
                                }
                                if (data.list[0].no2Value != "-") {
                                    that.conditions.no2 = parseFloat(data.list[0].no2Value) * 1000;
                                    that.log.debug('Current NO2 density is: %s', that.conditions.no2);
                                    that.sensorService
                                        .getCharacteristic(Characteristic.NitrogenDioxideDensity)
                                        .setValue(that.conditions.no2); 
                                }
                                if (data.list[0].so2Value != "-") {
                                    that.conditions.so2 = parseFloat(data.list[0].so2Value) * 1000;
                                    that.log.debug('Current SO2 density is: %s', that.conditions.so2);
                                    that.sensorService
                                        .getCharacteristic(Characteristic.SulphurDioxideDensity)
                                        .setValue(that.conditions.so2); 
                                }
                                if (data.list[0].coValue != "-") {
                                    that.conditions.co = parseFloat(data.list[0].coValue);
                                    that.log.debug('Current CO density is: %s', that.conditions.co);
                                    that.sensorService
                                        .getCharacteristic(Characteristic.CarbonMonoxideLevel)
                                        .setValue(that.conditions.co); 
                                }
                            break;
                        }
                        that.sensorService
                            .getCharacteristic(Characteristic.StatusActive)
                            .setValue(true);
                    break;
                    default:
                        that.log.error('Response: %s', response.statusCode);
                        that.sensorService
                            .getCharacteristic(Characteristic.StatusActive)
                            .setValue(false);
                    break;
                }
            } else {
                that.log.error('Unknown error: %s', error);
                that.sensorService
                    .getCharacteristic(Characteristic.StatusActive)
                    .setValue(false);
            }
            callback(that.conditions);
        });
    },


    convertGrade: function (grade) {
        var characteristic;
        if (!grade) {
            characteristic = Characteristic.AirQuality.UNKNOWN;
        } else if (grade >= 201) {
            characteristic = Characteristic.AirQuality.POOR;
        } else if (grade >= 151) {
            characteristic = Characteristic.AirQuality.INFERIOR;
        } else if (grade >= 101) {
            characteristic = Characteristic.AirQuality.FAIR;
        } else if (grade >= 51) {
            characteristic = Characteristic.AirQuality.GOOD;
        } else if (grade >= 0) {
            characteristic = Characteristic.AirQuality.EXCELLENT;
        } else {
            characteristic = Characteristic.AirQuality.UNKNOWN;
        }
        return characteristic;
    },

    identify: function (callback) {
        this.log.debug('Identified');
        callback();
    },

    getDateString: function(date) { 
        if(!date) return '-일 -시 현재';

        return date.getDate() + '일 ' + date.getHours() + '시 현재';
    },

    getServices: function () {
        var services = [];

        this.accessoryInformationService = new Service.AccessoryInformation();

        this.accessoryInformationService
            .setCharacteristic(Characteristic.FirmwareRevision, firmware)
            .setCharacteristic(Characteristic.Manufacturer, 'slasherLee')
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.SerialNumber, this.station);

        this.accessoryInformationService
            .setCharacteristic(Characteristic.Identify)
            .on('set', this.identify.bind(this));

        this.accessoryInformationService
            .setCharacteristic(Characteristic.Version)
            .on('set', this.identify.bind(this));

        switch (this.sensor) {
            case 'air_quality':
            default:
                this.model = 'Air Quality Sensor';
                this.sensorService = new Service.AirQualitySensor();
                this.sensorService
                     .getCharacteristic(Characteristic.AirQuality)
                     .on('get', this.getAirQuality.bind(this));
                break;
        }

        this.accessoryInformationService
            .setCharacteristic(Characteristic.Model, this.model);

        this.sensorService
            .setCharacteristic(Characteristic.Name, this.name);

        this.sensorService
            .addCharacteristic(Characteristic.StatusActive);

        services.push(
            this.accessoryInformationService,
            this.sensorService
        );

        return services;
    }
};

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-airkorea', 'AirKorea', AirKoreaAccessory);
}
