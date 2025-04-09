// Make sure you have included the socket.io client library
// <script src="/socket.io/socket.io.js"></script>

const socket = io();

// --- DOM Elements (replace with your actual element IDs) ---
const leftStatusEl = document.getElementById("left-status");
const rightStatusEl = document.getElementById("right-status");
const scanStatusEl = document.getElementById("scan-status");
const startScanBtn = document.getElementById("start-scan-btn");
const stopScanBtn = document.getElementById("stop-scan-btn");
const disconnectLeftBtn = document.getElementById("disconnect-left-btn");
const disconnectRightBtn = document.getElementById("disconnect-right-btn");

// --- Pressure Display Elements ---
const pressureValues = document.getElementById("pressure-values");
const leftVisualization = document.createElement("div");
const rightVisualization = document.createElement("div");

// Initialize visualizations
leftVisualization.className = "foot-outline";
rightVisualization.className = "foot-outline";
document.getElementById("foot-visualization").appendChild(leftVisualization);
document.getElementById("foot-visualization").appendChild(rightVisualization);

// Sensor positions in percentages
const sensorPositions = [
  { x: 50, y: 90 }, // heel
  { x: 70, y: 75 }, // back
  { x: 75, y: 50 }, // middle
  { x: 70, y: 25 }, // top
  { x: 50, y: 10 }, // toe
  { x: 30, y: 25 }, // side
];

// Create pressure points for both feet
function createPressurePoints(container, side) {
  sensorPositions.forEach((pos, index) => {
    const point = document.createElement("div");
    point.className = "pressure-point";
    point.id = `${side}-sensor-${index}`;
    point.style.left = `${pos.x}%`;
    point.style.top = `${pos.y}%`;
    container.appendChild(point);
  });
}

createPressurePoints(leftVisualization, "left");
createPressurePoints(rightVisualization, "right");

// --- Socket Listeners ---

socket.on("connect", () => {
  console.log("Connected to server via WebSocket");
  socket.emit("get-ble-status"); // Ask for initial status
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  // Optionally update UI to show server disconnected state
  leftStatusEl.textContent = "Server Down?";
  rightStatusEl.textContent = "Server Down?";
  scanStatusEl.textContent = "N/A";
});

socket.on("ble-connection-status", (status) => {
  console.log("Received BLE Status:", status);

  // Update Left Device Status
  if (status.left.connecting) {
    leftStatusEl.textContent = `Connecting to ${status.left.targetName}...`;
    leftStatusEl.className = "status-connecting";
  } else if (status.left.connected) {
    leftStatusEl.textContent = `Connected (${status.left.targetName})`;
    leftStatusEl.className = "status-connected";
  } else {
    leftStatusEl.textContent = `Disconnected (${status.left.targetName})`;
    leftStatusEl.className = "status-disconnected";
  }
  // Disable/enable disconnect button
  disconnectLeftBtn.disabled =
    !status.left.connected && !status.left.connecting;

  // Update Right Device Status
  if (status.right.connecting) {
    rightStatusEl.textContent = `Connecting to ${status.right.targetName}...`;
    rightStatusEl.className = "status-connecting";
  } else if (status.right.connected) {
    rightStatusEl.textContent = `Connected (${status.right.targetName})`;
    rightStatusEl.className = "status-connected";
  } else {
    rightStatusEl.textContent = `Disconnected (${status.right.targetName})`;
    rightStatusEl.className = "status-disconnected";
  }
  // Disable/enable disconnect button
  disconnectRightBtn.disabled =
    !status.right.connected && !status.right.connecting;

  // Update Scan Status
  scanStatusEl.textContent = status.scanning ? "Scanning..." : "Idle";
  startScanBtn.disabled =
    status.scanning || (status.left.connected && status.right.connected); // Disable if scanning or both connected
  stopScanBtn.disabled = !status.scanning;
});

// Function to update visualization for a foot
function updateFootVisualization(values, side) {
  values.forEach((value, index) => {
    const point = document.getElementById(`${side}-sensor-${index}`);
    if (point) {
      const size = Math.max(40, value + 40); // Base size 40px, increases with pressure
      const intensity = Math.min(255, Math.floor((value / 100) * 255));
      point.style.width = `${size}px`;
      point.style.height = `${size}px`;
      point.style.backgroundColor = `rgb(${intensity}, 0, 0)`;
      point.textContent = `${value.toFixed(1)}%`;
    }
  });
}

// Update pressure values display
function updatePressureValues(leftValues, rightValues) {
  const allValues = [];
  if (leftValues) {
    allValues.push(
      ...leftValues.map((value, i) => ({
        side: "Left",
        sensor: i + 1,
        value: value,
      }))
    );
  }
  if (rightValues) {
    allValues.push(
      ...rightValues.map((value, i) => ({
        side: "Right",
        sensor: i + 1,
        value: value,
      }))
    );
  }

  pressureValues.innerHTML = allValues
    .map(
      ({ side, sensor, value }) => `
        <div class="sensor-value">
            <strong>${side} Sensor ${sensor}:</strong>
            <span>${value.toFixed(1)}%</span>
        </div>
    `
    )
    .join("");
}

// Store the latest values
let latestLeftValues = null;
let latestRightValues = null;

socket.on("pressure-data-left", (values) => {
  latestLeftValues = values;
  updateFootVisualization(values, "left");
  updatePressureValues(latestLeftValues, latestRightValues);
});

socket.on("pressure-data-right", (values) => {
  latestRightValues = values;
  updateFootVisualization(values, "right");
  updatePressureValues(latestLeftValues, latestRightValues);
});

// --- Button Event Listeners ---
if (startScanBtn) {
  startScanBtn.addEventListener("click", () => {
    console.log("Requesting BLE scan start...");
    socket.emit("start-ble-scan");
  });
}

if (stopScanBtn) {
  stopScanBtn.addEventListener("click", () => {
    console.log("Requesting BLE scan stop...");
    socket.emit("stop-ble-scan");
  });
}

if (disconnectLeftBtn) {
  disconnectLeftBtn.addEventListener("click", () => {
    console.log("Requesting disconnect Left device...");
    socket.emit("disconnect-ble-device", "left");
  });
}

if (disconnectRightBtn) {
  disconnectRightBtn.addEventListener("click", () => {
    console.log("Requesting disconnect Right device...");
    socket.emit("disconnect-ble-device", "right");
  });
}

// Add some basic CSS for status indication (optional)
const style = document.createElement("style");
style.innerHTML = `
  .status-connected { color: green; font-weight: bold; }
  .status-disconnected { color: red; }
  .status-connecting { color: orange; }
`;
document.head.appendChild(style);
