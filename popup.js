const DEFAULT_CONFIG = {
  enabled: true,
  highlightMatches: true,
  showOverlay: true
};

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_CONFIG);
  document.getElementById("enabled").checked = data.enabled;
  document.getElementById("highlightMatches").checked = data.highlightMatches;
  document.getElementById("showOverlay").checked = data.showOverlay;
}

async function saveSetting(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

async function loadLastScan() {
  const data = await chrome.storage.local.get("lastScan");
  const box = document.getElementById("lastScan");
  const scan = data.lastScan;

  if (!scan) {
    box.textContent = "No scan data yet.";
    return;
  }

  const auth = scan.results?.authorization;
  const degree = scan.results?.degree;

  box.innerHTML = `
    <div><strong>Page:</strong> ${escapeHtml(scan.title || "(untitled)")}</div>
    <div><strong>Auth:</strong> ${auth?.matched ? auth.terms.join(", ") : "No match"}</div>
    <div><strong>Degree:</strong> ${degree?.matched ? degree.terms.join(", ") : "No match"}</div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.getElementById("enabled").addEventListener("change", (e) => {
  saveSetting("enabled", e.target.checked);
});

document.getElementById("highlightMatches").addEventListener("change", (e) => {
  saveSetting("highlightMatches", e.target.checked);
});

document.getElementById("showOverlay").addEventListener("change", (e) => {
  saveSetting("showOverlay", e.target.checked);
});

loadSettings();
loadLastScan();