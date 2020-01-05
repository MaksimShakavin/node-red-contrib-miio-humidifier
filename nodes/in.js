const miio = require('miio');


module.exports = function (RED) {
    class MiioHumidifierInput {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;
            node.status({}); //clean

            //get server node
            node.server = RED.nodes.getNode(node.config.server);
            if (node.server) {
                // node.server.on('onClose', () => this.onClose());
                node.server.on('onInitEnd', (status) => node.onInitEnd(status));
                node.server.on('onStateChanged', (data, output) => node.onStateChanged(data, output));
                node.server.on('onConnectionError', (error) => node.onConnectionError(error));


                if (node.config.outputAtStartup || node.config.for_homekit) {
                    node.sendState();
                }
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-miio-humidifier/in:status.server_node_error"
                });
            }
        }

        sendState() {
            var node = this;
            node.send({'payload':node.config.for_homekit?node.formatHomeKit():node.server.status, 'change': null, 'status': node.server.status});
        }

        updateStatus() {
            var node = this;

            if (Object.keys(node.server.status).length) {
                var isOn = node.server.status.power === 'on';
                var waterLevel = Math.ceil(node.server.status.depth / 1.2);
                var mode = node.server.status.mode;

                var status = {
                    fill: waterLevel <= 15 ? "yellow" : (isOn ? "green" : "red"),
                    shape: "dot",
                    text: (isOn ? "On (" + mode + ")" : "Off") + ',  ' + node.server.status.humidity + '%, ' + (node.server.status.temp_dec / 10).toFixed(1) + '℃' + ' 💧' + waterLevel
                };

                node.status(status);
            }
        }


        onInitEnd(status) {
            var node = this;
            node.updateStatus();

            if (node.config.outputAtStartup) {
                node.sendState();
            }
        }

        onStateChanged(data, output) {
            var node = this;

            if ("key" in data &&  ["power", "depth", "mode", "humidity", "temp_dec"].indexOf(data.key) >= 0) {
                node.updateStatus();
            }

            if (output) {
                node.send({'payload':node.config.for_homekit?node.formatHomeKit():data, 'change': data, 'status': node.server.status});
            }
        }

        onConnectionError(error) {
            var node = this;
            var status = {
                fill: "red",
                shape: "dot",
                text: "node-red-contrib-miio-humidifier/in:status.disconnected"
            };
            node.status(status);
        }

        formatHomeKit() {
            var node = this;
            var status = node.server.status;
            var msg = {};

            if (status.power === "on") {
                msg.Active = 1;
                msg.CurrentHumidifierDehumidifierState = 2;
            } else if (status.power === "off") {
                msg.Active = 0;
                msg.CurrentHumidifierDehumidifierState = 0;
            }
            if (status.child_lock === "on") {
                msg.LockPhysicalControls = 1;
            } else if (status.child_lock === "off") {
                msg.LockPhysicalControls = 0;
            }
            if (status.dry === "on") {
                msg.SwingMode = 1;
            } else if (status.dry === "off") {
                msg.SwingMode = 0;
            }

            if (status.mode === "auto") {
                msg.RotationSpeed = 25;
            } else if (status.mode === "silent") {
                msg.RotationSpeed = 50;
            } else if (status.mode === "medium") {
                msg.RotationSpeed = 75;
            } else if (status.mode === "high") {
                msg.RotationSpeed = 100;
            } else {
                msg.RotationSpeed = 0;
            }

            msg.WaterLevel = Math.ceil(status.depth / 1.2);
            msg.CurrentRelativeHumidity = status.humidity;
            msg.TargetHumidifierDehumidifierState = 1;
            msg.RelativeHumidityHumidifierThreshold = status.limit_hum;

            return msg;
        }
    }

    RED.nodes.registerType('miio-humidifier-input', MiioHumidifierInput, {});
};