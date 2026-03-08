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

function saveSetting(key, value) {
  chrome.storage.sync.set({ [key]: value }, () => {
    if (chrome.runtime.lastError) {
      setStatus("Failed to save setting: " + chrome.runtime.lastError.message);
      return;
    }
    setStatus(`Saved ${key}.`);
  });
}

function loadSettings() {
  chrome.storage.sync.get(
    {
      ...DEFAULT_CONFIG,
      geminiApiKey: ""
    },
    (sync) => {
      if (chrome.runtime.lastError) {
        setStatus("Failed to load settings: " + chrome.runtime.lastError.message);
        return;
      }

      enabledEl.checked = !!sync.enabled;
      highlightEl.checked = !!sync.highlightMatches;
      overlayEl.checked = !!sync.showOverlay;
      apiKeyInput.value = sync.geminiApiKey || "";
    }
  );
}

async function loadStoredData() {
  try {
    const tab = await getActiveTab();
    chrome.runtime.sendMessage(
      {
        type: "GET_STORED_DATA",
        payload: {
          pageUrl: tab.url || ""
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus("Failed to load stored data: " + chrome.runtime.lastError.message);
          return;
        }

        if (!response || !response.ok) {
          return;
        }

        const data = response.data || {};
        if (data.currentPageMatchResult) {
          setOutput(data.currentPageMatchResult);
        } else if (data.parsedResume) {
          setOutput(data.parsedResume);
        } else {
          setOutput("No result yet.");
        }
      }
    );
  } catch (error) {
    setStatus("Failed to load stored data.");
  }
}

saveApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.sync.set({ geminiApiKey: key }, () => {
    if (chrome.runtime.lastError) {
      setStatus("Failed to save API key: " + chrome.runtime.lastError.message);
      return;
    }
    setStatus(key ? "Gemini API key saved." : "Gemini API key cleared.");
  });
});

enabledEl.addEventListener("change", (e) => {
  saveSetting("enabled", e.target.checked);
});

highlightEl.addEventListener("change", (e) => {
  saveSetting("highlightMatches", e.target.checked);
});

overlayEl.addEventListener("change", (e) => {
  saveSetting("showOverlay", e.target.checked);
});

parseResumeBtn.addEventListener("click", async () => {
  try {
    const file = document.getElementById("resumePdf").files[0];
    if (!file) throw new Error("Please choose a PDF first.");

    setStatus("Reading PDF...");
    const base64 = await fileToBase64(file);

    setStatus("Uploading PDF to Gemini and parsing resume...");
    chrome.runtime.sendMessage(
      {
        type: "PARSE_RESUME_PDF",
        payload: {
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          fileDataBase64: base64
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus("Error.");
          setOutput(chrome.runtime.lastError.message);
          return;
        }

        if (!response || !response.ok) {
          setStatus("Error.");
          setOutput(response?.error || "Resume parsing failed.");
          return;
        }

        setStatus("Resume parsed successfully.");
        setOutput(response.parsedResume);
      }
    );
  } catch (error) {
    setStatus("Error.");
    setOutput(String(error));
  }
});

matchBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();

    setStatus("Reading current page...");
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => document.body?.innerText || ""
      },
      (results) => {
        if (chrome.runtime.lastError) {
          setStatus("Error.");
          setOutput(chrome.runtime.lastError.message);
          return;
        }

        const pageText = results?.[0]?.result || "";

        setStatus("Matching resume against job page...");
        chrome.runtime.sendMessage(
          {
            type: "MATCH_CURRENT_JOB",
            payload: {
              pageText,
              pageUrl: tab.url || "",
              pageTitle: tab.title || ""
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              setStatus("Error.");
              setOutput(chrome.runtime.lastError.message);
              return;
            }

            if (!response || !response.ok) {
              setStatus("Error.");
              setOutput(response?.error || "Matching failed.");
              return;
            }

            setStatus("Match complete.");
            setOutput(response.matchResult);
          }
        );
      }
    );
  } catch (error) {
    setStatus("Error.");
    setOutput(String(error));
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  loadStoredData();
});