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
// add /foot.svg as the outline background
leftVisualization.style.backgroundImage = "url('/leftfoot.svg')";
leftVisualization.style.backgroundSize = "cover";
rightVisualization.style.backgroundImage = "url('/rightfoot.svg')";
// rightVisualization.style.transform = "scaleX(-1)"; // Mirror the right foot image horizontally
rightVisualization.style.backgroundSize = "cover";

// Sensor positions in percentages

const sensorPositionsL = [
  { x: 75, y: 90 }, // heel
  { x: 75, y: 70 }, // middle
  { x: 70, y: 55 }, // new sensor 1
  { x: 75, y: 37 }, // top

  { x: 22, y: 45 }, // side
  { x: 50, y: 30 }, // top tripod

  { x: 35, y: 60 }, // new sensor 2

  { x: 50, y: 75 }, // back
];
const sensorPositionsR = [
  { x: 25, y: 90 }, // heel
  { x: 50, y: 75 }, // back
  { x: 28, y: 70 }, // middle
  { x: 22, y: 37 }, // top
  { x: 75, y: 45 }, // side
  { x: 50, y: 30 }, // top tripod

  { x: 70, y: 60 }, // new sensor 2

  { x: 30, y: 55 }, // new sensor 1
];
// const sensorPositionsL = [
//   { x: 22, y: 45 }, // side
//   { x: 50, y: 30 }, // top tripod
//   { x: 75, y: 37 }, // top

//   { x: 35, y: 60 }, // new sensor 2
//   { x: 70, y: 55 }, // new sensor 1

//   { x: 75, y: 70 }, // middle
//   { x: 50, y: 75 }, // back

//   { x: 75, y: 90 }, // heel
// ];
// const sensorPositionsR = [
//   { x: 75, y: 45 }, // side
//   { x: 50, y: 30 }, // top tripod
//   { x: 22, y: 37 }, // top

//   { x: 70, y: 60 }, // new sensor 2
//   { x: 30, y: 55 }, // new sensor 1

//   { x: 28, y: 70 }, // middle
//   { x: 50, y: 75 }, // back

//   { x: 25, y: 90 }, // heel
// ];
// Create pressure points for both feet
function createPressurePoints(container, side) {
  let sensorPositions = side === "left" ? sensorPositionsL : sensorPositionsR;

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

// IndexedDB setup for storing pressure data
const DB_NAME = "insolePressureDB";
const DB_VERSION = 1;
const STORE_NAME = "pressureData";
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => reject("IndexedDB error");
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
  });
}

function savePressureData(side, values) {
  openDB().then((db) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.add({
      timestamp: Date.now(),
      side,
      values: Array.from(values),
    });
  });
}

function getAllPressureData() {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject("Failed to fetch data");
    });
  });
}

function clearPressureData() {
  openDB().then((db) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  });
}

// --- Replay UI ---
const replayControls = document.createElement("div");
replayControls.innerHTML = `
  <button id="show-history-btn">Show History</button>
  <button id="replay-btn" disabled>Replay</button>
  <button id="clear-history-btn">Clear History</button>
  <input id="history-range" type="range" min="0" max="0" value="0" style="width:200px;" disabled />
  <span id="history-timestamp"></span>
`;
document.body.appendChild(replayControls);
const showHistoryBtn = document.getElementById("show-history-btn");
const replayBtn = document.getElementById("replay-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const historyRange = document.getElementById("history-range");
const historyTimestamp = document.getElementById("history-timestamp");

let historyData = [];
let replayInterval = null;
let replayIndex = 0;

showHistoryBtn.onclick = async () => {
  historyData = await getAllPressureData();
  if (historyData.length > 0) {
    historyRange.max = historyData.length - 1;
    historyRange.value = 0;
    historyRange.disabled = false;
    replayBtn.disabled = false;
    updateHistoryDisplay(0);
  } else {
    historyRange.max = 0;
    historyRange.value = 0;
    historyRange.disabled = true;
    replayBtn.disabled = true;
    historyTimestamp.textContent = "No history";
  }
};

clearHistoryBtn.onclick = () => {
  clearPressureData();
  historyData = [];
  historyRange.max = 0;
  historyRange.value = 0;
  historyRange.disabled = true;
  replayBtn.disabled = true;
  historyTimestamp.textContent = "History cleared";
};

historyRange.oninput = (e) => {
  const idx = parseInt(historyRange.value);
  updateHistoryDisplay(idx);
};

function updateHistoryDisplay(idx) {
  if (!historyData.length) return;
  const entry = historyData[idx];
  if (!entry) return;
  historyTimestamp.textContent =
    new Date(entry.timestamp).toLocaleString() + ` (${entry.side})`;
  if (entry.side === "left") {
    updateFootVisualization(entry.values, "left");
    updatePressureValues(entry.values, latestRightValues);
  } else {
    updateFootVisualization(entry.values, "right");
    updatePressureValues(latestLeftValues, entry.values);
  }
}

replayBtn.onclick = () => {
  if (replayInterval) {
    clearInterval(replayInterval);
    replayInterval = null;
    replayBtn.textContent = "Replay";
    return;
  }
  if (!historyData.length) return;
  replayIndex = 0;
  replayBtn.textContent = "Stop Replay";
  replayInterval = setInterval(() => {
    if (replayIndex >= historyData.length) {
      clearInterval(replayInterval);
      replayInterval = null;
      replayBtn.textContent = "Replay";
      return;
    }
    historyRange.value = replayIndex;
    updateHistoryDisplay(replayIndex);
    replayIndex++;
  }, 100); // 100ms per frame
};

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

  // --- Auto-reconnect logic ---
  // Helper to reconnect if disconnected
  function tryReconnect(side) {
    // Only try to reconnect if not already connecting or connected
    if (!status[side].connected && !status[side].connecting) {
      // Add a small delay to avoid spamming
      setTimeout(() => {
        console.log(`Auto-reconnecting ${side} device...`);
        socket.emit("connect-ble-device", side);
      }, 2000); // 2 seconds delay
    }
  }

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
    tryReconnect("left");
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
    tryReconnect("right");
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
      const size = 40 + Math.floor((value / 1024) * 50); // Base size 40px, increases with pressure
      const intensity = Math.min(255, Math.floor((value / 1024) * 255));
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
  savePressureData("left", values);
});

socket.on("pressure-data-right", (values) => {
  latestRightValues = values;
  updateFootVisualization(values, "right");
  updatePressureValues(latestLeftValues, latestRightValues);
  savePressureData("right", values);
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
