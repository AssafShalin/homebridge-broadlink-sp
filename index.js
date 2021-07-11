var Service, Characteristic;
var broadlink = require('broadlinkjs-sm');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-broadlink-sp", "broadlinkSP", broadlinkSP);
}

function broadlinkSP(log, config, api) {
    this.log = log;
    this.ip = config['ip'];
    this.name = config['name'];
    this.mac = config['mac'];
    this.powered = false;

    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");

    // MAC string to MAC buffer
    this.mac_buff = function(mac) {
        var mb = new Buffer(6);
        if (mac) {
            var values = mac.split(':');
            if (!values || values.length !== 6) {
                throw new Error('Invalid MAC [' + mac + ']; should follow pattern ##:##:##:##:##:##');
            }
            for (var i = 0; i < values.length; ++i) {
                var tmpByte = parseInt(values[i], 16);
                mb.writeUInt8(tmpByte, i);
            }
        } else {
            //this.log("MAC address emtpy, using IP: " + this.ip);
        }
        return mb;
    }

    this.service = new Service.Switch(this.name);

    this.service.getCharacteristic(Characteristic.On)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));

    this.accessoryInformationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'Broadlink')
        .setCharacteristic(Characteristic.Model, 'SP')
        .setCharacteristic(Characteristic.SerialNumber, '1.0')
}

broadlinkSP.prototype.getState = function(callback) {
    var self = this
    var b = new broadlink();
    self.log('Discovering Devices');
    b.discover();
    const discoveryService = setInterval(() => {
        b.discover();
    }, 100);
    let didTimeout = false;
    const timeout = setTimeout(() => {
        didTimeout = true;
        clearInterval(discoveryService);
        self.log(`getState timeout, using last state: ${self.powered}`);
        return callback(null, self.powered);
    }, 2000);
    let didFinishOp = false;
    b.on("deviceReady", (dev) => {
        if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
            clearInterval(discoveryService);
            dev.check_power();
            const checkPowerInterval = setInterval(() => {
                dev.check_power();
            }, 100);
            dev.on("power", (pwr) => {
                clearTimeout(timeout);
                clearInterval(checkPowerInterval);
                self.log("power is on - " + pwr);
                dev.exit();
                if(!didTimeout && !didFinishOp) {
                    if (!pwr) {
                        self.powered = false;
                        didFinishOp = true;
                        return callback(null, false);
                    } else {
                        self.powered = true;
                        didFinishOp = true;
                        return callback(null, true);
                    }
                }
            });
        } else {
            dev.exit();
        }
    });
    
}

broadlinkSP.prototype.setState = function(state, callback) {
    var self = this
    var b = new broadlink();
    b.discover();
    const discoveryService = setInterval(() => {
        b.discover();
    }, 100);
    let didTimeout = false;
    const setStateTimeout = setTimeout(() => {
        didTimeout = true;
        clearInterval(discoveryService);
        self.log(`setState timeout`);
        return callback(null);
    }, 2000);
    self.log("set SP state: " + state);
    let didFinishOp = false;
    b.on("deviceReady", (dev) => {
        if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
            clearInterval(discoveryService);
            clearTimeout(setStateTimeout);
            if(!didFinishOp) {
                didFinishOp = true;
                self.log(`setState is now ${state}!`);
                dev.set_power(state);
                dev.exit();
                this.powered = state;
                if(!didTimeout) {
                    return callback(null);
                }
            }
        } else {
            dev.exit();
        }
    });
}

broadlinkSP.prototype.getServices = function() {
    return [
        this.service,
        this.accessoryInformationService
    ]
}