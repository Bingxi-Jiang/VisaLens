const DEFAULT_CONFIG = {
  enabled: true,
  highlightMatches: true,
  showOverlay: true
};

const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const parseResumeBtn = document.getElementById("parseResumeBtn");
const matchBtn = document.getElementById("matchBtn");
const output = document.getElementById("output");
const statusBox = document.getElementById("status");

const enabledEl = document.getElementById("enabled");
const highlightEl = document.getElementById("highlightMatches");
const overlayEl = document.getElementById("showOverlay");

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) throw new Error("No active tab found.");
  return tabs[0];
}

function setStatus(text) {
  statusBox.textContent = text;
}

function setOutput(obj) {
  output.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file as data URL."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function saveSetting(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

async function loadSettings() {
  const sync = await chrome.storage.sync.get({
    ...DEFAULT_CONFIG,
    geminiApiKey: ""
  });

  enabledEl.checked = sync.enabled;
  highlightEl.checked = sync.highlightMatches;
  overlayEl.checked = sync.showOverlay;
  apiKeyInput.value = sync.geminiApiKey || "";
}

async function loadStoredData() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STORED_DATA" });
  if (!response?.ok) return;

  const data = response.data || {};
  if (data.lastMatchResult) {
    setOutput(data.lastMatchResult);
  } else if (data.parsedResume) {
    setOutput(data.parsedResume);
  }
}

saveApiKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  await chrome.storage.sync.set({ geminiApiKey: key });
  setStatus(key ? "Gemini API key saved." : "Gemini API key cleared.");
});

enabledEl.addEventListener("change", (e) => saveSetting("enabled", e.target.checked));
highlightEl.addEventListener("change", (e) => saveSetting("highlightMatches", e.target.checked));
overlayEl.addEventListener("change", (e) => saveSetting("showOverlay", e.target.checked));

parseResumeBtn.addEventListener("click", async () => {
  try {
    const file = document.getElementById("resumePdf").files[0];
    if (!file) throw new Error("Please choose a PDF first.");

    setStatus("Reading PDF...");
    const base64 = await fileToBase64(file);

    setStatus("Uploading PDF to Gemini and parsing resume...");
    const response = await chrome.runtime.sendMessage({
      type: "PARSE_RESUME_PDF",
      payload: {
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        fileDataBase64: base64
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Resume parsing failed.");
    }

    setStatus("Resume parsed successfully.");
    setOutput(response.parsedResume);
  } catch (error) {
    setStatus("Error.");
    setOutput(String(error));
  }
});

matchBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();

    setStatus("Reading current page...");
    const [{ result: pageText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body?.innerText || ""
    });

    setStatus("Matching resume against job page...");
    const response = await chrome.runtime.sendMessage({
      type: "MATCH_CURRENT_JOB",
      payload: {
        pageText
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Matching failed.");
    }

    setStatus("Match complete.");
    setOutput(response.matchResult);
  } catch (error) {
    setStatus("Error.");
    setOutput(String(error));
  }
});

(async function init() {
  await loadSettings();
  await loadStoredData();
})();