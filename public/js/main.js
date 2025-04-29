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
  { x: 50, y: 75 }, // back
  { x: 35, y: 60 }, // new sensor 2

  { x: 26, y: 42 }, // side
  { x: 71, y: 10 }, // top tripod
  { x: 75, y: 33 }, // top
  { x: 70, y: 55 }, // new sensor 1

  { x: 75, y: 70 }, // middle
];
const sensorPositionsR = [
  { x: 25, y: 90 }, // heel
  { x: 50, y: 75 }, // back
  { x: 70, y: 60 }, // new sensor 2
  { x: 72, y: 40 }, // side
  { x: 28, y: 10 }, // top tripod
  { x: 26, y: 33 }, // top

  { x: 30, y: 55 }, // new sensor 1
  { x: 28, y: 70 }, // middle
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
  if (!isRecording) return;
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
  <button id="start-recording-btn">Start Recording</button>
  <button id="stop-recording-btn" disabled>Stop Recording</button>
  <button id="download-csv-btn">Download CSV</button>
  <input id="history-range" type="range" min="0" max="0" value="0" style="width:200px;" disabled />
  <span id="history-timestamp"></span>
`;
document.body.appendChild(replayControls);
const showHistoryBtn = document.getElementById("show-history-btn");
const replayBtn = document.getElementById("replay-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const startRecordingBtn = document.getElementById("start-recording-btn");
const stopRecordingBtn = document.getElementById("stop-recording-btn");
const downloadCsvBtn = document.getElementById("download-csv-btn");
const historyRange = document.getElementById("history-range");
const historyTimestamp = document.getElementById("history-timestamp");

let historyData = [];
let replayInterval = null;
let replayIndex = 0;
let isRecording = false;

// --- Center of Mass Calculation ---
/**
 * Calculate the center of mass for an array of 2D pressure sensors.
 * @param {Array} sensorPositions - Array of {x, y} objects for each sensor.
 * @param {Array} pressures - Array of pressure values (0-1023) for each sensor.
 * @returns {{x: number, y: number} | null} Center of mass coordinates or null if total pressure is zero.
 */
function calculateCenterOfMass(sensorPositions, pressures) {
  let totalPressure = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let i = 0; i < sensorPositions.length; i++) {
    const p = pressures[i];
    totalPressure += p;
    weightedX += sensorPositions[i].x * p;
    weightedY += sensorPositions[i].y * p;
  }
  if (totalPressure === 0) return null;
  return {
    x: weightedX / totalPressure,
    y: weightedY / totalPressure,
  };
}

// --- Center of Mass Marker Logic ---
function createOrUpdateCOMMarker(container, id, com) {
  let marker = container.querySelector(`#${id}`);
  if (!marker) {
    marker = document.createElement("div");
    marker.id = id;
    marker.className = "com-marker";
    marker.style.position = "absolute";
    marker.style.width = "18px";
    marker.style.height = "18px";
    marker.style.borderRadius = "50%";
    marker.style.border = "3px solid #e67e22";
    marker.style.background = "rgba(241, 196, 15, 0.7)";
    marker.style.zIndex = 10;
    marker.style.pointerEvents = "none";
    container.appendChild(marker);
  }
  if (com) {
    marker.style.display = "block";
    marker.style.left = `calc(${com.x}% - 9px)`;
    marker.style.top = `calc(${com.y}% - 9px)`;
  } else {
    marker.style.display = "none";
  }
}

// --- Add CSS for .com-marker ---
(function addCOMMarkerStyle() {
  const style = document.createElement("style");
  style.innerHTML = `.com-marker { transition: left 0.1s, top 0.1s, background 0.2s; box-shadow: 0 0 8px 2px #f1c40f; }`;
  document.head.appendChild(style);
})();
startRecordingBtn.onclick = () => {
  isRecording = true;
  startRecordingBtn.disabled = true;
  stopRecordingBtn.disabled = false;
};
stopRecordingBtn.onclick = () => {
  isRecording = false;
  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
};

downloadCsvBtn.onclick = async () => {
  const allData = await getAllPressureData();
  if (!allData.length) {
    alert("No data to export.");
    return;
  }
  let csv = "timestamp,side,";
  const maxSensors = Math.max(...allData.map((d) => d.values.length));
  for (let i = 0; i < maxSensors; i++) {
    csv += `sensor${i + 1}` + (i < maxSensors - 1 ? "," : "\n");
  }
  allData.forEach((row) => {
    csv += `${row.timestamp},${row.side},` + row.values.join(",") + "\n";
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pressure_data.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

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
  const com = calculateCenterOfMass(sensorPositionsL, values);
  createOrUpdateCOMMarker(leftVisualization, "com-marker-left", com);
  updatePressureValues(latestLeftValues, latestRightValues);
  savePressureData("left", values);
  handleCadence("left", values);
});

socket.on("pressure-data-right", (values) => {
  latestRightValues = values;
  updateFootVisualization(values, "right");
  const com = calculateCenterOfMass(sensorPositionsR, values);
  createOrUpdateCOMMarker(rightVisualization, "com-marker-right", com);
  updatePressureValues(latestLeftValues, latestRightValues);
  savePressureData("right", values);
  handleCadence("right", values);
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

// --- Cadence Tracker ---
const CADENCE_THRESHOLD = 15; // Pressure threshold for lift detection
const cadenceData = { left: [], right: [] };
const cadenceIntervals = { left: [], right: [] };
let lastLiftTime = { left: null, right: null };
let lastLiftState = { left: false, right: false };
// Create cadence graph canvas
const cadenceGraph = document.createElement("canvas");
cadenceGraph.width = 600;
cadenceGraph.height = 200;
cadenceGraph.style.border = "1px solid #ccc";
cadenceGraph.style.display = "block";
cadenceGraph.style.margin = "20px auto";
document.body.appendChild(cadenceGraph);
const cadenceCtx = cadenceGraph.getContext("2d");

function detectLift(side, values) {
  // Only use the first sensor value for cadence detection
  return values[0] < CADENCE_THRESHOLD;
}

function handleCadence(side, values) {
  const now = Date.now() / 1000;
  const lifted = detectLift(side, values);
  if (lifted && !lastLiftState[side]) {
    // Foot just lifted
    if (lastLiftTime[side] !== null) {
      const interval = now - lastLiftTime[side];
      cadenceIntervals[side].push(interval);
      if (cadenceIntervals[side].length > 50) cadenceIntervals[side].shift();
    }
    cadenceData[side].push(now);
    if (cadenceData[side].length > 100) cadenceData[side].shift();
    lastLiftTime[side] = now;
    drawCadenceGraph();
  }
  lastLiftState[side] = lifted;
}

function drawCadenceGraph() {
  cadenceCtx.clearRect(0, 0, cadenceGraph.width, cadenceGraph.height);
  // Draw axes
  cadenceCtx.strokeStyle = "#888";
  cadenceCtx.beginPath();
  cadenceCtx.moveTo(40, 10);
  cadenceCtx.lineTo(40, 190);
  cadenceCtx.lineTo(590, 190);
  cadenceCtx.stroke();
  // Draw cadence for left and right
  ["left", "right"].forEach((side, idx) => {
    const intervals = cadenceIntervals[side];
    if (intervals.length < 2) return;
    cadenceCtx.strokeStyle = side === "left" ? "#0074D9" : "#FF4136";
    cadenceCtx.beginPath();
    for (let i = 1; i < intervals.length; i++) {
      const x = 40 + (i - 1) * (550 / 49);
      const cadence = 60 / intervals[i]; // steps per minute
      const y = 190 - Math.min(180, cadence * 3); // scale for graph
      if (i === 1) cadenceCtx.moveTo(x, y);
      else cadenceCtx.lineTo(x, y);
    }
    cadenceCtx.stroke();
    // Draw label
    cadenceCtx.fillStyle = cadenceCtx.strokeStyle;
    cadenceCtx.fillText(
      side.charAt(0).toUpperCase() + side.slice(1),
      550,
      30 + idx * 20
    );
  });
  // Draw y-axis labels
  cadenceCtx.fillStyle = "#000";
  cadenceCtx.fillText("Cadence (steps/min)", 50, 20);
  for (let i = 0; i <= 6; i++) {
    const y = 190 - i * 30;
    cadenceCtx.fillText((i * 20).toString(), 5, y + 5);
  }
}
// --- Integrate cadence tracking into pressure data handling ---
socket.on("pressure-data", (values) => {
  // Assume left and right values are split or available
  // If only one set, treat as left for demo
  handleCadence("left", values);
  // If you have right foot data, call handleCadence("right", rightValues);
});
