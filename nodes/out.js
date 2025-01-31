
module.exports = function (RED) {
    class MiioHumidifierOutput {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;

            //get server node
            node.server = RED.nodes.getNode(node.config.server);
            if (node.server) {
                // node.server.on('onClose', () => this.onClose());
                // node.server.on('onStateChanged', (data) => node.onStateChanged(data));
                // node.server.on('onStateChangedError', (error) => node.onStateChangedError(error));
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-miio-humidifier/out:status.server_node_error"
                });
            }

            node.status({}); //clean

            node.on('input', function(message) {
                clearTimeout(node.cleanTimer);

                var payload;
                switch (node.config.payloadType) {
                    case 'flow':
                    case 'global': {
                        RED.util.evaluateNodeProperty(node.config.payload, node.config.payloadType, this, message, function (error, result) {
                            if (error) {
                                node.error(error, message);
                            } else {
                                payload = result;
                            }
                        });
                        break;
                    }

                    case 'num': {
                        payload = parseInt(node.config.payload);
                        break;
                    }

                    case 'str': {
                        payload = node.config.payload;
                        break;
                    }

                    case 'object': {
                        payload = node.config.payload;
                        break;
                    }

                    case 'miio_payload':
                        payload = node.config.payload;
                        break;

                    case 'homekit':
                    case 'msg':
                    default: {
                        payload = message[node.config.payload];
                        break;
                    }
                }

                var command;
                switch (node.config.commandType) {
                    case 'msg': {
                        command = message[node.config.command];
                        break;
                    }
                    case 'miio_cmd':
                        command = node.config.command;

                        switch (command) {
                            case "set_power":
                            case "set_buzzer":
                            case "set_led_b":
                                if (payload === 'on' || payload === 1 || payload === '1' || payload === true) payload = 1;
                                if (payload === 'off' || payload === 0 || payload === '0' || payload === false) payload = 0;
                                break;

                            default: {
                                break;
                            }
                        }



                        break;

                    case 'homekit':
                        var fromHomekit = node.formatHomeKit(message, payload);
                        if (fromHomekit) {
                            command = 'json';
                            payload = fromHomekit;
                        } else {
                            payload = command = null;
                        }
                        break;

                    case 'str':
                    default: {
                        command = node.config.command;
                        break;
                    }
                }


                if (command === 'json') {
                    for (var key in payload) {
                        node.sendCommand(key, payload[key]);
                    }
                } else {
                    node.sendCommand(command, payload);
                }
            });
        }

        sendCommand(command, payload) {
            var node = this;
            var device = node.server.device;


            if (device === null) return false;
            if (device === undefined) return false;
            if (command === null) return false;
            if (payload === undefined) payload = [];
            if (typeof(payload) !== 'object') payload = [payload];

            // console.log('BEFORE SEND:');
            // console.log({command:command,payload:payload});

            const mappedCommand = this.mapCommand(command);
            return device.call(mappedCommand, payload).then(result => {
                var status = {
                    fill: "green",
                    shape: "dot",
                    text: command
                };

                var sendPayload = result;
                if (Object.keys(result).length === 1 && (typeof(result[0]) === 'string' || typeof(result[0]) === 'number')) {
                    status.text += ': '+result[0];
                    sendPayload = result[0];
                }
                node.status(status);
                node.cleanTimer = setTimeout(function(){
                    node.status({});
                }, 3000);


                node.send({request: {command: command, payload: payload}, payload: sendPayload});
            }).catch(err => {
                node.warn("Miio Humiditifier error on command '"+command+"': "+err.message);
                node.send({request: {command: command, args: payload}, error: err});
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-miio-humidifier/out:status.error"
                });
                node.cleanTimer = setTimeout(function(){
                    node.status({});
                }, 3000);
            });
        }

        mapCommand(command) {
            switch (command) {
                case 'set_power':
                    return 'Set_OnOff';
                case 'set_buzzer':
                    return 'SetTipSound_Status';
                case 'set_mode':
                    return 'Set_HumidifierGears';
                case 'set_limit_hum':
                    return 'Set_HumiValue'
                case 'set_led_b':
                    return 'SetLedState'
                default:
                    return command;
            }
        }

        formatHomeKit(message, payload) {
            var msg = {};
            if (Object.keys(payload).length) {
                if (payload.RelativeHumidityHumidifierThreshold !== undefined) {
                    let value = payload.RelativeHumidityHumidifierThreshold;
                    if (value > 0 && value <= 40) {
                        value = 40;
                    } else if (value > 70 && value <= 100) {
                        value = 70;
                    }

                    msg["set_limit_hum"] = value;
                }

                if (payload.Active !== undefined) {
                    msg["set_power"] = Boolean(payload.Active) ? 1 : 0;
                }

                if (payload.RotationSpeed !== undefined) {
                    var value = payload.RotationSpeed;
                    var newVal;
                    if (value <= 25) {
                        newVal = 1;
                    } else if (value > 25 && value <= 50) {
                        newVal = 2;
                    } else if (value > 50 && value <= 75) {
                        newVal = 3;
                    } else if (value > 75) {
                        newVal = 4;
                    }

                    msg["set_mode"] = newVal;
                }
            }


            return msg;
        }
    }

    RED.nodes.registerType('miio-humidifier-output', MiioHumidifierOutput);
};
