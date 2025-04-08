import express from "express";
import { SerialPort } from "serialport";
import { Server } from "socket.io";
import http from "http";
import path from "path";

// Import the list ports function

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const BAUD_RATE = 115200;
let currentPort: SerialPort | null = null;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Initialize serial port and handle reconnection
const initializeSerialPort = (portPath: string) => {
  try {
    if (currentPort) {
      currentPort.close();
    }

    currentPort = new SerialPort({
      path: portPath,
      baudRate: BAUD_RATE,
    });

    currentPort.on("error", (err) => {
      console.error("Serial port error:", err);
      io.emit("connection-status", { connected: false, error: err.message });
    });

    currentPort.on("close", () => {
      console.log("Serial port closed");
      io.emit("connection-status", { connected: false });
    });

    currentPort.on("data", (data) => {
      try {
        const line = data.toString().trim();
        if (!line) {
          console.log("[Serial] Received empty data");
          return;
        }

        console.log("\n[Serial] Raw data received:", line);
        const values: number[] = [];
        const parts = line.split(" ");
        console.log("[Serial] Split data into parts:", parts);

        for (const part of parts) {
          if (part.includes("_g:")) {
            const value = parseInt(part.split(":")[1]);
            if (!isNaN(value)) {
              const percentValue = Number(((value / 1024) * 100).toFixed(1));
              values.push(percentValue);
              console.log(
                `[Serial] Parsed value: ${percentValue.toFixed(1)}% from part: ${part}`
              );
            } else {
              console.log("[Serial] Invalid number format in part:", part);
            }
          }
        }

        if (values.length === 6) {
          console.log("\n[Serial] ✓ Valid pressure data received:");
          console.log("Sensor 1 (Toe):      ", values[0].toFixed(1), "%");
          console.log("Sensor 2 (Left Mid): ", values[1].toFixed(1), "%");
          console.log("Sensor 3 (Right Mid):", values[2].toFixed(1), "%");
          console.log("Sensor 4 (Left Arch):", values[3].toFixed(1), "%");
          console.log("Sensor 5 (Right Arch):", values[4].toFixed(1), "%");
          console.log("Sensor 6 (Heel):     ", values[5].toFixed(1), "%");
          io.emit("pressure-data", values);
        } else {
          console.log(
            `[Serial] ✗ Incomplete data: expected 6 values, got ${values.length}`
          );
        }
      } catch (error) {
        console.error("Error parsing serial data:", error);
      }
    });
  } catch (error: any) {
    console.error("Failed to initialize serial port:", error);
    setTimeout(initializeSerialPort, 2000);
  }
};

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log("Client connected");

  // Handle port listing request
  socket.on("list-ports", async () => {
    try {
      const ports = await SerialPort.list();
      const enhancedPorts = ports.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer || "Unknown",
        serialNumber: port.serialNumber || "N/A",
        vendorId: port.vendorId || "N/A",
        productId: port.productId || "N/A",
        pnpId: port.pnpId || "N/A",
      }));
      console.log("[Serial] Available ports:", enhancedPorts);
      socket.emit("ports-list", enhancedPorts);
    } catch (error) {
      console.error("Error listing ports:", error);
      socket.emit("ports-list", []);
      socket.emit("connection-status", {
        connected: false,
        error: "Failed to list ports",
      });
    }
  });

  // Handle port connection request
  socket.on("connect-port", (portPath: string) => {
    try {
      initializeSerialPort(portPath);
      socket.emit("connection-status", { connected: true });
    } catch (error) {
      socket.emit("connection-status", {
        connected: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  });

  // Handle port disconnection request
  socket.on("disconnect-port", () => {
    if (currentPort) {
      currentPort.close();
      socket.emit("connection-status", { connected: false });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("Client connected");
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start the server
const PORT = 3000;

const startServer = (port: number) => {
  try {
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error: any) {
    console.error(`Failed to start server on port ${port}:`, error);
    if (error.code === "EADDRINUSE") {
      console.log("Trying alternate port...");
      startServer(port + 1);
    }
  }
};

startServer(PORT);
