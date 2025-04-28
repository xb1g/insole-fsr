"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const noble_1 = __importDefault(require("@abandonware/noble")); // Import noble
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
// --- Configuration ---
// IMPORTANT: Replace with your actual device names and UUIDs
const LEFT_DEVICE_NAME = "ESP32_LeftFoot"; // Or use MAC address / partial name
const RIGHT_DEVICE_NAME = "ESP32_RightFoot"; // Or use MAC address / partial name
// Use the Service/Characteristic UUIDs defined in your ESP32 BLE server code
const TARGET_SERVICE_UUID = "4fafc2011fb5459e8fccc5c9c331914c"; // Example - NO dashes for noble discovery
const TARGET_CHARACTERISTIC_UUID = "beb5483e36e14688b7f5ea07361b26a9"; // Example - NO dashes for noble discovery
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server);
const leftDevice = {
    peripheral: null,
    characteristic: null,
    connected: false,
    connecting: false,
    name: "Left",
    targetName: LEFT_DEVICE_NAME,
    serviceUUID: TARGET_SERVICE_UUID,
    characteristicUUID: TARGET_CHARACTERISTIC_UUID,
};
const rightDevice = {
    peripheral: null,
    characteristic: null,
    connected: false,
    connecting: false,
    name: "Right",
    targetName: RIGHT_DEVICE_NAME,
    serviceUUID: TARGET_SERVICE_UUID,
    characteristicUUID: TARGET_CHARACTERISTIC_UUID,
};
const devicesToManage = [leftDevice, rightDevice];
let isScanning = false;
// Serve static files (assuming your public folder structure)
// If using TypeScript, __dirname might behave differently depending on compilation target/module system
const publicPath = path_1.default.join(process.cwd(), "public"); // More reliable path
app.use(express_1.default.static(publicPath));
// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path_1.default.join(publicPath, "index.html"));
});
// --- Helper Functions ---
function emitDeviceStatus() {
    const status = {
        left: {
            connected: leftDevice.connected,
            connecting: leftDevice.connecting,
            targetName: leftDevice.targetName,
        },
        right: {
            connected: rightDevice.connected,
            connecting: rightDevice.connecting,
            targetName: rightDevice.targetName,
        },
        scanning: isScanning,
    };
    console.log("Emitting Status:", status);
    io.emit("ble-connection-status", status);
}
function decodeADCValues(buffer) {
    const values = [];
    for (let i = 0; i < buffer.length; i += 2) {
        // Ensure we have at least 2 bytes left
        if (i + 1 >= buffer.length)
            break;
        // Little-endian decoding
        const value = buffer[i] | (buffer[i + 1] << 8);
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
        const values = decodeADCValues(data);
        console.log(values, "adc");
        // Check if we got the expected number of values (e.g., 6)
        if (values.length === 8) {
            // let values = adcValues;
            console.log(`\n[BLE ${deviceState.name}] ✓ Valid pressure data received:`);
            // Emit data specific to the device
            const eventName = deviceState.name === "Left"
                ? "pressure-data-left"
                : "pressure-data-right";
            console.log(`Emitting ${eventName}:`, values);
            io.emit(eventName, values);
        }
        else {
            console.log(`[BLE ${deviceState.name}] ✗ Incomplete data: expected 8 values, got ${values.length}`);
            // console.log(
            //   `  -> Parsed values: ${values.join(", ")} from raw: "${line}"`
            // );
        }
    }
    catch (error) {
        console.error(`[BLE ${deviceState.name}] Error processing data:`, error);
        console.error(`  -> Raw data buffer: <${data.toString("hex")}>`);
    }
}
// Function to connect and set up a device
async function connectAndSetup(peripheral, deviceState) {
    console.log(`[BLE ${deviceState.name}] Attempting to connect to ${peripheral.advertisement.localName} (${peripheral.address})`);
    deviceState.connecting = true;
    deviceState.connected = false;
    emitDeviceStatus();
    // Handle disconnect event for this peripheral
    peripheral.once("disconnect", () => {
        console.error(`[BLE ${deviceState.name}] Disconnected from ${deviceState.targetName} (${peripheral.address})`);
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
    try {
        await peripheral.connectAsync();
        console.log(`[BLE ${deviceState.name}] Connected to ${peripheral.advertisement.localName}`);
        deviceState.peripheral = peripheral;
        deviceState.connected = true; // Mark as connected *before* discovery
        deviceState.connecting = false;
        console.log(`[BLE ${deviceState.name}] Discovering services...`);
        // Noble uses UUIDs without dashes for discovery
        const services = await peripheral.discoverServicesAsync([
            deviceState.serviceUUID,
        ]);
        if (services.length === 0) {
            throw new Error(`Service ${deviceState.serviceUUID} not found.`);
        }
        const service = services[0];
        console.log(`[BLE ${deviceState.name}] Found service: ${service.uuid}`);
        console.log(`[BLE ${deviceState.name}] Discovering characteristics...`);
        const characteristics = await service.discoverCharacteristicsAsync([
            deviceState.characteristicUUID,
        ]);
        if (characteristics.length === 0) {
            throw new Error(`Characteristic ${deviceState.characteristicUUID} not found.`);
        }
        const characteristic = characteristics[0];
        deviceState.characteristic = characteristic;
        console.log(`[BLE ${deviceState.name}] Found characteristic: ${characteristic.uuid}`);
        // Subscribe to notifications
        if (characteristic.properties.includes("notify")) {
            console.log(`[BLE ${deviceState.name}] Subscribing to notifications...`);
            characteristic.on("data", (data) => handleBleData(data, deviceState));
            await characteristic.subscribeAsync();
            console.log(`[BLE ${deviceState.name}] Subscribed successfully.`);
        }
        else {
            throw new Error("Characteristic does not support notifications.");
        }
        // Final status update after successful setup
        emitDeviceStatus();
    }
    catch (error) {
        console.error(`[BLE ${deviceState.name}] Error connecting/setting up ${deviceState.targetName}:`, error);
        deviceState.connected = false;
        deviceState.connecting = false;
        if (peripheral && peripheral.state === "connected") {
            await peripheral
                .disconnectAsync()
                .catch((e) => console.error(`[BLE ${deviceState.name}] Error during disconnect after setup failure:`, e));
        }
        deviceState.peripheral = null; // Clear peripheral on error
        deviceState.characteristic = null;
        emitDeviceStatus();
        // Optional: Try scanning again if failed
        if (!isScanning) {
            startScanning();
        }
    }
}
// --- Noble BLE Event Handlers ---
noble_1.default.on("stateChange", (state) => {
    console.log(`[BLE] Adapter State Changed: ${state}`);
    if (state === "poweredOn") {
        startScanning();
    }
    else {
        console.log("[BLE] Adapter not powered on. Stopping scan.");
        stopScanning();
        // Mark devices as disconnected if adapter goes down
        devicesToManage.forEach((d) => {
            d.connected = false;
            d.connecting = false;
            d.peripheral = null;
            d.characteristic = null;
        });
        emitDeviceStatus();
    }
});
noble_1.default.on("scanStart", () => {
    console.log("[BLE] Scan started...");
    isScanning = true;
    emitDeviceStatus();
});
noble_1.default.on("scanStop", () => {
    console.log("[BLE] Scan stopped.");
    isScanning = false;
    emitDeviceStatus();
});
noble_1.default.on("discover", (peripheral) => {
    const peripheralName = peripheral.advertisement.localName;
    if (!peripheralName)
        return; // Ignore devices without names
    // Check if this peripheral matches one of our target devices that isn't connected/connecting
    const targetDevice = devicesToManage.find((d) => peripheralName.includes(d.targetName) && // Use includes for flexibility
        !d.connected &&
        !d.connecting);
    if (targetDevice) {
        console.log(`[BLE] Found target device: ${peripheralName} (${peripheral.address}) for ${targetDevice.name}`);
        // Stop scanning temporarily to connect (important!)
        stopScanning();
        // Attempt to connect and set up
        connectAndSetup(peripheral, targetDevice);
        // Check if we still need to scan for the other device
        const otherDeviceNeedsScan = devicesToManage.some((d) => !d.connected && !d.connecting && d !== targetDevice);
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
    if (noble_1.default._state !== "poweredOn") {
        console.warn("[BLE] Cannot start scan: Adapter not powered on.");
        return;
    }
    if (isScanning) {
        console.log("[BLE] Already scanning.");
        return;
    }
    // Check if we even need to scan
    const needsScan = devicesToManage.some((d) => !d.connected && !d.connecting);
    if (!needsScan) {
        console.log("[BLE] Both devices connected, no need to scan.");
        return;
    }
    console.log("[BLE] Starting BLE scan for services:", [TARGET_SERVICE_UUID]);
    // Scan specifically for the service UUID to reduce noise (optional, but good practice)
    // Set duplicateFiltering to true if you only want one discovery event per device per scan session
    noble_1.default
        .startScanningAsync([TARGET_SERVICE_UUID], false) // Allow duplicates initially to catch reconnects
        .catch((error) => {
        console.error("[BLE] Error starting scan:", error);
        isScanning = false; // Ensure flag is reset on error
        emitDeviceStatus();
    });
}
function stopScanning() {
    if (!isScanning)
        return;
    console.log("[BLE] Stopping scan.");
    noble_1.default
        .stopScanningAsync()
        .catch((e) => console.error("[BLE] Error stopping scan:", e));
    isScanning = false; // Manually set as noble event might be delayed
    emitDeviceStatus(); // Update status immediately
}
// --- Socket.IO Event Handlers ---
io.on("connection", (socket) => {
    console.log("Web Client connected:", socket.id);
    // Send current status immediately to new client
    emitDeviceStatus();
    // Allow client to request status update
    socket.on("get-ble-status", () => {
        emitDeviceStatus();
    });
    // Allow client to trigger a scan (e.g., via a button)
    socket.on("start-ble-scan", () => {
        console.log("Web Client requested BLE scan start.");
        startScanning();
    });
    // Allow client to stop a scan
    socket.on("stop-ble-scan", () => {
        console.log("Web Client requested BLE scan stop.");
        stopScanning();
    });
    // Allow client to explicitly disconnect a device (optional)
    socket.on("disconnect-ble-device", async (deviceName) => {
        console.log(`Web Client requested disconnect for ${deviceName}`);
        const deviceState = deviceName === "left" ? leftDevice : rightDevice;
        if (deviceState.peripheral &&
            (deviceState.connected || deviceState.connecting)) {
            try {
                await deviceState.peripheral.disconnectAsync();
                console.log(`[BLE ${deviceState.name}] Disconnected by client request.`);
                // The 'disconnect' event handler on the peripheral will clean up state.
            }
            catch (error) {
                console.error(`[BLE ${deviceState.name}] Error disconnecting by client request:`, error);
                // Force state cleanup if disconnectAsync fails
                deviceState.peripheral = null;
                deviceState.characteristic = null;
                deviceState.connected = false;
                deviceState.connecting = false;
                emitDeviceStatus();
                if (!isScanning)
                    startScanning(); // Try to find it again
            }
        }
        else {
            console.log(`[BLE ${deviceState.name}] Cannot disconnect, not connected/connecting.`);
        }
    });
    socket.on("disconnect", () => {
        console.log("Web Client disconnected:", socket.id);
    });
});
// --- Start the Server ---
const PORT = 3000;
const startServer = (port) => {
    server
        .listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`BLE Devices configured:`);
        console.log(`  Left: ${LEFT_DEVICE_NAME}`);
        console.log(`  Right: ${RIGHT_DEVICE_NAME}`);
        console.log(`Service UUID: ${TARGET_SERVICE_UUID}`);
        console.log(`Characteristic UUID: ${TARGET_CHARACTERISTIC_UUID}`);
        // Initialization of BLE is handled by noble's stateChange event
    })
        .on("error", (error) => {
        console.error(`Failed to start server on port ${port}:`, error);
        if (error.code === "EADDRINUSE") {
            console.log(`Port ${port} in use, trying alternate port ${port + 1}...`);
            startServer(port + 1); // Try next port
        }
        else {
            process.exit(1); // Exit on other server errors
        }
    });
};
startServer(PORT);
// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("\nCaught interrupt signal (Ctrl+C)");
    stopScanning(); // Stop scanning first
    const disconnectPromises = devicesToManage
        .filter((d) => d.peripheral && d.connected)
        .map((d) => {
        console.log(`Disconnecting from ${d.name} (${d.targetName})...`);
        return d
            .peripheral.disconnectAsync()
            .catch((e) => console.error(`Error disconnecting ${d.name}:`, e));
    });
    await Promise.all(disconnectPromises);
    console.log("All BLE devices disconnected.");
    server.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
    });
    // Force exit after a timeout if server doesn't close gracefully
    setTimeout(() => {
        console.error("Could not close connections gracefully, forcing exit.");
        process.exit(1);
    }, 5000);
});
