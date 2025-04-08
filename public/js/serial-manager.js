class SerialManager {
  constructor() {
    this.socket = io();
    this.currentPort = null;
    this.portSelector = document.getElementById("port-selector");
    this.connectButton = document.getElementById("connect-button");

    // Initialize event listeners
    this.connectButton.addEventListener("click", () => this.toggleConnection());
    this.portSelector.addEventListener("change", () =>
      this.updateSelectedPort()
    );

    // Listen for port list updates from server
    this.socket.on("ports-list", (ports) => this.updatePortsList(ports));
    this.socket.on("connection-status", (status) =>
      this.updateConnectionStatus(status)
    );

    // Request initial ports list
    this.socket.emit("list-ports");
  }

  updatePortsList(ports) {
    // Clear existing options
    this.portSelector.innerHTML = '<option value="">Select a port...</option>';

    // Add new options
    ports.forEach((port) => {
      const option = document.createElement("option");
      option.value = port.path;
      const portInfo = [
        port.path,
        port.manufacturer,
        port.serialNumber !== "N/A" ? `S/N: ${port.serialNumber}` : null,
        port.vendorId !== "N/A" ? `VID: ${port.vendorId}` : null,
        port.productId !== "N/A" ? `PID: ${port.productId}` : null,
      ]
        .filter(Boolean)
        .join(" - ");
      option.textContent = portInfo;
      this.portSelector.appendChild(option);
    });

    // If we have a current port, select it
    if (this.currentPort) {
      this.portSelector.value = this.currentPort;
    }
  }

  updateSelectedPort() {
    const selectedPort = this.portSelector.value;
    if (selectedPort) {
      this.currentPort = selectedPort;
    }
  }

  toggleConnection() {
    if (!this.currentPort) {
      alert("Please select a port first");
      return;
    }

    if (this.connectButton.textContent === "Connect") {
      this.socket.emit("connect-port", this.currentPort);
    } else {
      this.socket.emit("disconnect-port");
    }
  }

  updateConnectionStatus(status) {
    if (status.connected) {
      this.connectButton.textContent = "Disconnect";
      this.connectButton.classList.remove("btn-primary");
      this.connectButton.classList.add("btn-danger");
      this.portSelector.disabled = true;
    } else {
      this.connectButton.textContent = "Connect";
      this.connectButton.classList.remove("btn-danger");
      this.connectButton.classList.add("btn-primary");
      this.portSelector.disabled = false;
    }
  }
}

// Initialize the serial manager when the page loads
window.addEventListener("load", () => {
  new SerialManager();
});
