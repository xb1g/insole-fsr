"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var express_1 = require("express");
var noble_1 = require("@abandonware/noble"); // Import noble
var socket_io_1 = require("socket.io");
var http_1 = require("http");
var path_1 = require("path");
// --- Configuration ---
// IMPORTANT: Replace with your actual device names and UUIDs
var LEFT_DEVICE_NAME = "ESP32_LeftFoot"; // Or use MAC address / partial name
var RIGHT_DEVICE_NAME = "ESP32_RightFoot"; // Or use MAC address / partial name
// Use the Service/Characteristic UUIDs defined in your ESP32 BLE server code
var TARGET_SERVICE_UUID = "4fafc2011fb5459e8fccc5c9c331914c"; // Example - NO dashes for noble discovery
var TARGET_CHARACTERISTIC_UUID = "beb5483e36e14688b7f5ea07361b26a9"; // Example - NO dashes for noble discovery
var app = (0, express_1["default"])();
var server = http_1["default"].createServer(app);
var io = new socket_io_1.Server(server);
var leftDevice = {
    peripheral: null,
    characteristic: null,
    connected: false,
    connecting: false,
    name: "Left",
    targetName: LEFT_DEVICE_NAME,
    serviceUUID: TARGET_SERVICE_UUID,
    characteristicUUID: TARGET_CHARACTERISTIC_UUID
};
var rightDevice = {
    peripheral: null,
    characteristic: null,
    connected: false,
    connecting: false,
    name: "Right",
    targetName: RIGHT_DEVICE_NAME,
    serviceUUID: TARGET_SERVICE_UUID,
    characteristicUUID: TARGET_CHARACTERISTIC_UUID
};
var devicesToManage = [leftDevice, rightDevice];
var isScanning = false;
// Serve static files (assuming your public folder structure)
// If using TypeScript, __dirname might behave differently depending on compilation target/module system
var publicPath = path_1["default"].join(process.cwd(), "public"); // More reliable path
app.use(express_1["default"].static(publicPath));
// Serve the main page
app.get("/", function (req, res) {
    res.sendFile(path_1["default"].join(publicPath, "index.html"));
});
// --- Helper Functions ---
function emitDeviceStatus() {
    var status = {
        left: {
            connected: leftDevice.connected,
            connecting: leftDevice.connecting,
            targetName: leftDevice.targetName
        },
        right: {
            connected: rightDevice.connected,
            connecting: rightDevice.connecting,
            targetName: rightDevice.targetName
        },
        scanning: isScanning
    };
    console.log("Emitting Status:", status);
    io.emit("ble-connection-status", status);
}
function decodeADCValues(buffer) {
    var values = [];
    for (var i = 0; i < buffer.length; i += 2) {
        // Ensure we have at least 2 bytes left
        if (i + 1 >= buffer.length)
            break;
        // Little-endian decoding
        var value = buffer[i] | (buffer[i + 1] << 8);
        values.push(value);
    }
    return values;
}
// Function to handle incoming BLE data
function handleBleData(data, deviceState) {
    try {
        // data should be like Readings: [1]:344 [2]:344 [3]:340 [4]:328 [5]:287 [6]:272 [7]:297 [8]:89
        // it is a databuffer of 16 bytes
        // *** CRITICAL: Assumes ESP32 sends data as a UTF8 string matching the old serial format ***
        // If ESP32 sends binary (e.g., array of uint16_t), parsing needs complete change here.
        var values = decodeADCValues(data);
        console.log(values, "adc");
        // Check if we got the expected number of values (e.g., 6)
        if (values.length === 8) {
            // let values = adcValues;
            console.log("\n[BLE ".concat(deviceState.name, "] \u2713 Valid pressure data received:"));
            // Emit data specific to the device
            var eventName = deviceState.name === "Left"
                ? "pressure-data-left"
                : "pressure-data-right";
            console.log("Emitting ".concat(eventName, ":"), values);
            io.emit(eventName, values);
        }
        else {
            console.log("[BLE ".concat(deviceState.name, "] \u2717 Incomplete data: expected 8 values, got ").concat(values.length));
            // console.log(
            //   `  -> Parsed values: ${values.join(", ")} from raw: "${line}"`
            // );
        }
    }
    catch (error) {
        console.error("[BLE ".concat(deviceState.name, "] Error processing data:"), error);
        console.error("  -> Raw data buffer: <".concat(data.toString("hex"), ">"));
    }
}
// Function to connect and set up a device
function connectAndSetup(peripheral, deviceState) {
    return __awaiter(this, void 0, void 0, function () {
        var services, service, characteristics, characteristic, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[BLE ".concat(deviceState.name, "] Attempting to connect to ").concat(peripheral.advertisement.localName, " (").concat(peripheral.address, ")"));
                    deviceState.connecting = true;
                    deviceState.connected = false;
                    emitDeviceStatus();
                    // Handle disconnect event for this peripheral
                    peripheral.once("disconnect", function () {
                        console.error("[BLE ".concat(deviceState.name, "] Disconnected from ").concat(deviceState.targetName, " (").concat(peripheral.address, ")"));
                        deviceState.peripheral = null;
                        deviceState.characteristic = null;
                        deviceState.connected = false;
                        deviceState.connecting = false;
                        emitDeviceStatus();
                        // Optional: Automatically try to reconnect by restarting scan
                        if (!isScanning) {
                            startScanning();
                        }
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 8, , 11]);
                    return [4 /*yield*/, peripheral.connectAsync()];
                case 2:
                    _a.sent();
                    console.log("[BLE ".concat(deviceState.name, "] Connected to ").concat(peripheral.advertisement.localName));
                    deviceState.peripheral = peripheral;
                    deviceState.connected = true; // Mark as connected *before* discovery
                    deviceState.connecting = false;
                    console.log("[BLE ".concat(deviceState.name, "] Discovering services..."));
                    return [4 /*yield*/, peripheral.discoverServicesAsync([
                            deviceState.serviceUUID,
                        ])];
                case 3:
                    services = _a.sent();
                    if (services.length === 0) {
                        throw new Error("Service ".concat(deviceState.serviceUUID, " not found."));
                    }
                    service = services[0];
                    console.log("[BLE ".concat(deviceState.name, "] Found service: ").concat(service.uuid));
                    console.log("[BLE ".concat(deviceState.name, "] Discovering characteristics..."));
                    return [4 /*yield*/, service.discoverCharacteristicsAsync([
                            deviceState.characteristicUUID,
                        ])];
                case 4:
                    characteristics = _a.sent();
                    if (characteristics.length === 0) {
                        throw new Error("Characteristic ".concat(deviceState.characteristicUUID, " not found."));
                    }
                    characteristic = characteristics[0];
                    deviceState.characteristic = characteristic;
                    console.log("[BLE ".concat(deviceState.name, "] Found characteristic: ").concat(characteristic.uuid));
                    if (!characteristic.properties.includes("notify")) return [3 /*break*/, 6];
                    console.log("[BLE ".concat(deviceState.name, "] Subscribing to notifications..."));
                    characteristic.on("data", function (data) { return handleBleData(data, deviceState); });
                    return [4 /*yield*/, characteristic.subscribeAsync()];
                case 5:
                    _a.sent();
                    console.log("[BLE ".concat(deviceState.name, "] Subscribed successfully."));
                    return [3 /*break*/, 7];
                case 6: throw new Error("Characteristic does not support notifications.");
                case 7:
                    // Final status update after successful setup
                    emitDeviceStatus();
                    return [3 /*break*/, 11];
                case 8:
                    error_1 = _a.sent();
                    console.error("[BLE ".concat(deviceState.name, "] Error connecting/setting up ").concat(deviceState.targetName, ":"), error_1);
                    deviceState.connected = false;
                    deviceState.connecting = false;
                    if (!(peripheral && peripheral.state === "connected")) return [3 /*break*/, 10];
                    return [4 /*yield*/, peripheral
                            .disconnectAsync()["catch"](function (e) {
                            return console.error("[BLE ".concat(deviceState.name, "] Error during disconnect after setup failure:"), e);
                        })];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10:
                    deviceState.peripheral = null; // Clear peripheral on error
                    deviceState.characteristic = null;
                    emitDeviceStatus();
                    // Optional: Try scanning again if failed
                    if (!isScanning) {
                        startScanning();
                    }
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
// --- Noble BLE Event Handlers ---
noble_1["default"].on("stateChange", function (state) {
    console.log("[BLE] Adapter State Changed: ".concat(state));
    if (state === "poweredOn") {
        startScanning();
    }
    else {
        console.log("[BLE] Adapter not powered on. Stopping scan.");
        stopScanning();
        // Mark devices as disconnected if adapter goes down
        devicesToManage.forEach(function (d) {
            d.connected = false;
            d.connecting = false;
            d.peripheral = null;
            d.characteristic = null;
        });
        emitDeviceStatus();
    }
});
noble_1["default"].on("scanStart", function () {
    console.log("[BLE] Scan started...");
    isScanning = true;
    emitDeviceStatus();
});
noble_1["default"].on("scanStop", function () {
    console.log("[BLE] Scan stopped.");
    isScanning = false;
    emitDeviceStatus();
});
noble_1["default"].on("discover", function (peripheral) {
    var peripheralName = peripheral.advertisement.localName;
    if (!peripheralName)
        return; // Ignore devices without names
    // Check if this peripheral matches one of our target devices that isn't connected/connecting
    var targetDevice = devicesToManage.find(function (d) {
        return peripheralName.includes(d.targetName) && // Use includes for flexibility
            !d.connected &&
            !d.connecting;
    });
    if (targetDevice) {
        console.log("[BLE] Found target device: ".concat(peripheralName, " (").concat(peripheral.address, ") for ").concat(targetDevice.name));
        // Stop scanning temporarily to connect (important!)
        stopScanning();
        // Attempt to connect and set up
        connectAndSetup(peripheral, targetDevice);
        // Check if we still need to scan for the other device
        var otherDeviceNeedsScan = devicesToManage.some(function (d) { return !d.connected && !d.connecting && d !== targetDevice; });
        if (otherDeviceNeedsScan) {
            console.log("[BLE] Still need to find other device(s), restarting scan soon...");
            // Restart scan after a short delay to allow connection attempt to proceed
            setTimeout(startScanning, 2000); // Adjust delay if needed
        }
    }
    else {
        // console.log(`[BLE] Discovered other device: ${peripheralName} (${peripheral.address})`);
    }
});
function startScanning() {
    if (noble_1["default"]._state !== "poweredOn") {
        console.warn("[BLE] Cannot start scan: Adapter not powered on.");
        return;
    }
    if (isScanning) {
        console.log("[BLE] Already scanning.");
        return;
    }
    // Check if we even need to scan
    var needsScan = devicesToManage.some(function (d) { return !d.connected && !d.connecting; });
    if (!needsScan) {
        console.log("[BLE] Both devices connected, no need to scan.");
        return;
    }
    console.log("[BLE] Starting BLE scan for services:", [TARGET_SERVICE_UUID]);
    // Scan specifically for the service UUID to reduce noise (optional, but good practice)
    // Set duplicateFiltering to true if you only want one discovery event per device per scan session
    noble_1["default"]
        .startScanningAsync([TARGET_SERVICE_UUID], false) // Allow duplicates initially to catch reconnects
    ["catch"](function (error) {
        console.error("[BLE] Error starting scan:", error);
        isScanning = false; // Ensure flag is reset on error
        emitDeviceStatus();
    });
}
function stopScanning() {
    if (!isScanning)
        return;
    console.log("[BLE] Stopping scan.");
    noble_1["default"]
        .stopScanningAsync()["catch"](function (e) { return console.error("[BLE] Error stopping scan:", e); });
    isScanning = false; // Manually set as noble event might be delayed
    emitDeviceStatus(); // Update status immediately
}
// --- Socket.IO Event Handlers ---
io.on("connection", function (socket) {
    console.log("Web Client connected:", socket.id);
    // Send current status immediately to new client
    emitDeviceStatus();
    // Allow client to request status update
    socket.on("get-ble-status", function () {
        emitDeviceStatus();
    });
    // Allow client to trigger a scan (e.g., via a button)
    socket.on("start-ble-scan", function () {
        console.log("Web Client requested BLE scan start.");
        startScanning();
    });
    // Allow client to stop a scan
    socket.on("stop-ble-scan", function () {
        console.log("Web Client requested BLE scan stop.");
        stopScanning();
    });
    // Allow client to explicitly disconnect a device (optional)
    socket.on("disconnect-ble-device", function (deviceName) { return __awaiter(void 0, void 0, void 0, function () {
        var deviceState, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Web Client requested disconnect for ".concat(deviceName));
                    deviceState = deviceName === "left" ? leftDevice : rightDevice;
                    if (!(deviceState.peripheral &&
                        (deviceState.connected || deviceState.connecting))) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, deviceState.peripheral.disconnectAsync()];
                case 2:
                    _a.sent();
                    console.log("[BLE ".concat(deviceState.name, "] Disconnected by client request."));
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    console.error("[BLE ".concat(deviceState.name, "] Error disconnecting by client request:"), error_2);
                    // Force state cleanup if disconnectAsync fails
                    deviceState.peripheral = null;
                    deviceState.characteristic = null;
                    deviceState.connected = false;
                    deviceState.connecting = false;
                    emitDeviceStatus();
                    if (!isScanning)
                        startScanning(); // Try to find it again
                    return [3 /*break*/, 4];
                case 4: return [3 /*break*/, 6];
                case 5:
                    console.log("[BLE ".concat(deviceState.name, "] Cannot disconnect, not connected/connecting."));
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); });
    socket.on("disconnect", function () {
        console.log("Web Client disconnected:", socket.id);
    });
});
// --- Start the Server ---
var PORT = 3000;
var startServer = function (port) {
    server
        .listen(port, function () {
        console.log("Server running at http://localhost:".concat(port));
        console.log("BLE Devices configured:");
        console.log("  Left: ".concat(LEFT_DEVICE_NAME));
        console.log("  Right: ".concat(RIGHT_DEVICE_NAME));
        console.log("Service UUID: ".concat(TARGET_SERVICE_UUID));
        console.log("Characteristic UUID: ".concat(TARGET_CHARACTERISTIC_UUID));
        // Initialization of BLE is handled by noble's stateChange event
    })
        .on("error", function (error) {
        console.error("Failed to start server on port ".concat(port, ":"), error);
        if (error.code === "EADDRINUSE") {
            console.log("Port ".concat(port, " in use, trying alternate port ").concat(port + 1, "..."));
            startServer(port + 1); // Try next port
        }
        else {
            process.exit(1); // Exit on other server errors
        }
    });
};
startServer(PORT);
// Graceful shutdown
process.on("SIGINT", function () { return __awaiter(void 0, void 0, void 0, function () {
    var disconnectPromises;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("\nCaught interrupt signal (Ctrl+C)");
                stopScanning(); // Stop scanning first
                disconnectPromises = devicesToManage
                    .filter(function (d) { return d.peripheral && d.connected; })
                    .map(function (d) {
                    console.log("Disconnecting from ".concat(d.name, " (").concat(d.targetName, ")..."));
                    return d
                        .peripheral.disconnectAsync()["catch"](function (e) { return console.error("Error disconnecting ".concat(d.name, ":"), e); });
                });
                return [4 /*yield*/, Promise.all(disconnectPromises)];
            case 1:
                _a.sent();
                console.log("All BLE devices disconnected.");
                server.close(function () {
                    console.log("HTTP server closed.");
                    process.exit(0);
                });
                // Force exit after a timeout if server doesn't close gracefully
                setTimeout(function () {
                    console.error("Could not close connections gracefully, forcing exit.");
                    process.exit(1);
                }, 5000);
                return [2 /*return*/];
        }
    });
}); });
