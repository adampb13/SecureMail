const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh");

async function loadStatus() {
  statusEl.textContent = "Checking...";

  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    statusEl.textContent = data.status === "ok" ? "Backend is up" : "Unexpected response";
  } catch (error) {
    statusEl.textContent = "Backend unavailable";
  }
}

refreshBtn.addEventListener("click", loadStatus);

loadStatus();
