const miio = require('miio-api');

module.exports = function (RED) {
    class ServerNode {
        constructor(n) {
            RED.nodes.createNode(this, n);

            var node = this;
            node.config = n;
            node.state = [];
            node.status = {};

            node.setMaxListeners(255);
            node.refreshFindTimer = null;
            node.refreshFindInterval = node.config.polling * 1000;
            node.on('close', () => this.onClose());

            node.connect().then(result => {
                node.getStatus(true).then(result => {
                    node.emit("onInitEnd", result);
                });
            });

            node.refreshStatusTimer = setInterval(function () {
                node.getStatus(true);
            }, node.refreshFindInterval);
        }

        onClose() {
            var that = this;
            clearInterval(that.refreshStatusTimer);

            if (that.device) {
                that.device.destroy();
                that.device = null;
            }
        }

        connect() {
            var node = this;

            return new Promise(function (resolve, reject) {
                node.miio = miio.device({
                    address: node.config.ip,
                    token: node.config.token
                }).then(device => {
                    node.device = device;
                    node.log('Miio humiditifier: Initialized');
                    resolve(device);
                }).catch(err => {
                    node.emit('onConnectionError', err.message);
                    node.warn('Miio humiditifier Error: ' + err.message);
                    reject(err);
                });
            });
        }

        getStatus(force = false) {
            var that = this;

            async function mapSeries(args, action) {
                const results = [];
                for (const arg of args) {
                    results.push(await action(arg));
                }
                return results;
            }

            return new Promise(function (resolve, reject) {
                if (force || !that.status) {
                    if (that.device !== null && that.device !== undefined) {
                        const props = ["OnOff_State", "Humidity_Value", "waterstatus", "HumiSet_Value", "Humidifier_Gear", "TipSound_State", "Led_State", "TemperatureValue"];
                        mapSeries(props, async (key) => {
                            return await that.device.call('get_prop', [key])
                        })
                            .then(resultsArr => {
                                const [power, humidity, depth, limit_hum, mode, buzzer, led_b, temp_dec] = resultsArr.flatMap(res => res);
                                return {
                                    power, humidity, depth, limit_hum, buzzer, mode, led_b, temp_dec
                                }
                            })
                            .then(result => {

                                that.emit("onState", result);

                                for (var key in result) {
                                    var value = result[key];
                                    if (key in that.status) {
                                        if (!(key in that.status) || that.status[key] !== value) {
                                            that.status[key] = value;
                                            that.emit("onStateChanged", {
                                                key: key,
                                                value: value
                                            }, true);
                                        }
                                    } else { //init: silent add
                                        that.status[key] = value;
                                        that.emit("onStateChanged", {
                                            key: key,
                                            value: value
                                        }, false);
                                    }
                                }
                                resolve(that.status);
                            })
                            .catch(err => {
                                console.log('Encountered an error while controlling device');
                                console.log('Error(1) was:');
                                console.log(err.message);
                                that.status = {};
                                that.emit('onConnectionError', err.message);
                                reject(err);
                            });
                        //TODO remove child_lock dry
                        // power -> OnOff_State
                        // humidity -> Humidity_Value
                        // depth -> waterstatus
                        // limit_hum -> HumiSet_Value
                        // buzzer -> TipSound_State
                        // mode -> Humidifier_Gear
                        // led_b -> Led_State
                        // temp_dec -> TemperatureValue


                    } else {
                        that.connect();
                        that.status = {};
                        that.emit('onConnectionError', 'No device');
                        reject('No device');
                    }
                } else {
                    resolve(that.status);
                }
            });
        }

    }

    RED.nodes.registerType('miio-humidifier-server', ServerNode, {});
};
