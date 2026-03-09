const statusEl = document.getElementById("status");
const openBtn = document.getElementById("openBtn");
const minimizeBtn = document.getElementById("minimizeBtn");
const hideBtn = document.getElementById("hideBtn");

function setStatus(text) {
  statusEl.textContent = text;
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tabs || !tabs.length) {
        reject(new Error("No active tab found."));
        return;
      }
      resolve(tabs[0]);
    });
  });
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

openBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "OPEN_OVERLAY" });
    setStatus("Overlay opened.");
  } catch (error) {
    setStatus(error.message);
  }
});

minimizeBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "MINIMIZE_OVERLAY" });
    setStatus("Overlay minimized.");
  } catch (error) {
    setStatus(error.message);
  }
});

hideBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "HIDE_OVERLAY" });
    setStatus("Overlay hidden for this page.");
  } catch (error) {
    setStatus(error.message);
  }
});