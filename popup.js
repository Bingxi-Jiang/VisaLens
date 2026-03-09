const DEFAULT_CONFIG = {
  enabled: true,
  highlightMatches: true,
  showOverlay: true
};

const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const parseResumeBtn = document.getElementById("parseResumeBtn");
const matchBtn = document.getElementById("matchBtn");
const summarizeHistoryBtn = document.getElementById("summarizeHistoryBtn");
const historyMeta = document.getElementById("historyMeta");
const output = document.getElementById("output");
const statusBox = document.getElementById("status");

const enabledEl = document.getElementById("enabled");
const highlightEl = document.getElementById("highlightMatches");
const overlayEl = document.getElementById("showOverlay");

const profileMeta = document.getElementById("profileMeta");
const profilePills = document.getElementById("profilePills");

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

function setStatus(text) {
  statusBox.textContent = text;
}

function setOutput(obj) {
  output.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function switchTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

function renderProfile(parsedResume) {
  if (!parsedResume) {
    profileMeta.textContent = "No parsed resume yet.";
    profilePills.innerHTML = "";
    return;
  }

  const name = parsedResume.name || "Unknown candidate";
  const skills = Array.isArray(parsedResume.skills) ? parsedResume.skills.slice(0, 8) : [];
  const degrees = Array.isArray(parsedResume.degrees) ? parsedResume.degrees.slice(0, 4) : [];

  profileMeta.textContent = `Parsed profile loaded for ${name}.`;

  const pills = [...degrees, ...skills].slice(0, 12);
  profilePills.innerHTML = pills.length
    ? pills.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")
    : "";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function getCurrentPageScanResults(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();

          const authPatterns = [
            /\bsponsor(ship|ed|ing)?\b/i,
            /\b(no|not)\s+(visa\s+)?sponsor(ship|ed|ing)?\b/i,
            /\bvisa\s+sponsor(ship|ed|ing)?\b/i,
            /\bwork\s+authorization\b/i,
            /\bno\s+work\s+authorization\b/i,
            /\bmust\s+be\s+authorized\s+to\s+work\b/i,
            /\blegally\s+authorized\s+to\s+work\b/i,
            /\bauthorized\s+to\s+work\s+in\s+the\s+u\.?s\.?\b/i,
            /\bwithout\s+(current\s+or\s+future\s+)?sponsor(ship)?\b/i,
            /\bcurrent\s+or\s+future\s+need\s+for\s+sponsorship\b/i,
            /\bwill\s+not\s+sponsor\b/i,
            /\bus\s+citizen(ship)?\b/i,
            /\bu\.?s\.?\s+citizen(ship)?\b/i,
            /\bcitizenship\s+required\b/i,
            /\bpermanent\s+resident\b/i,
            /\bgreen\s+card\b/i,
            /\bopt\b/i,
            /\bcpt\b/i,
            /\bh-?1b\b/i
          ];

          const degreePatterns = [
            /\bbachelor'?s?\b/i,
            /\bbachelor\s+of\s+science\b/i,
            /\bbachelor\s+of\s+arts\b/i,
            /\bundergraduate\b/i,
            /\bbs\b/i,
            /\bb\.s\.\b/i,
            /\bba\b/i,
            /\bb\.a\.\b/i,
            /\bmaster'?s?\b/i,
            /\bmaster\s+of\s+science\b/i,
            /\bmaster\s+of\s+arts\b/i,
            /\bgraduate\s+degree\b/i,
            /\bms\b/i,
            /\bm\.s\.\b/i,
            /\bma\b/i,
            /\bm\.a\.\b/i,
            /\bmeng\b/i,
            /\bm\.eng\.\b/i,
            /\bmba\b/i,
            /\bph\.?d\.?\b/i,
            /\bdoctorate\b/i,
            /\bdoctoral\b/i,
            /\bdoctor\s+of\s+philosophy\b/i
          ];

          function collectTerms(patterns) {
            const found = new Set();
            for (const regex of patterns) {
              const match = text.match(regex);
              if (match && match[0]) found.add(match[0]);
            }
            return Array.from(found);
          }

          const authTerms = collectTerms(authPatterns);
          const degreeTerms = collectTerms(degreePatterns);

          const blockerPatterns = [
            /\bno\s+sponsorship\b/i,
            /\bwill\s+not\s+sponsor\b/i,
            /\bmust\s+be\s+authorized\s+to\s+work\b/i,
            /\bwithout\s+(current\s+or\s+future\s+)?sponsorship\b/i,
            /\bcitizenship\s+required\b/i,
            /\bus\s+citizen(ship)?\s+required\b/i,
            /\bsecurity\s+clearance\s+required\b/i
          ];

          const blocker = blockerPatterns.some((r) => r.test(text));

          return {
            authorization: {
              matched: authTerms.length > 0,
              terms: authTerms,
              blocker
            },
            degree: {
              matched: degreeTerms.length > 0,
              terms: degreeTerms
            }
          };
        }
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(results?.[0]?.result || null);
      }
    );
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
        const historyCount = Array.isArray(data.atsHistory) ? data.atsHistory.length : 0;
        historyMeta.textContent = `ATS history count: ${historyCount}`;

        renderProfile(data.parsedResume || null);

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
        renderProfile(response.parsedResume || null);
        setOutput(response.parsedResume);
        switchTab("profileTab");
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
      async (results) => {
        if (chrome.runtime.lastError) {
          setStatus("Error.");
          setOutput(chrome.runtime.lastError.message);
          return;
        }

        const pageText = results?.[0]?.result || "";

        let scanResults = null;
        try {
          scanResults = await getCurrentPageScanResults(tab.id);
        } catch (e) {
          scanResults = null;
        }

        setStatus("Matching resume against job page...");
        chrome.runtime.sendMessage(
          {
            type: "MATCH_CURRENT_JOB",
            payload: {
              pageText,
              pageUrl: tab.url || "",
              pageTitle: tab.title || "",
              scanResults
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
            switchTab("resultTab");
            loadStoredData();
          }
        );
      }
    );
  } catch (error) {
    setStatus("Error.");
    setOutput(String(error));
  }
});

summarizeHistoryBtn.addEventListener("click", () => {
  setStatus("Summarizing ATS history...");
  chrome.runtime.sendMessage(
    {
      type: "SUMMARIZE_ATS_HISTORY"
    },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus("Error.");
        setOutput(chrome.runtime.lastError.message);
        return;
      }

      if (!response || !response.ok) {
        setStatus("Error.");
        setOutput(response?.error || "Failed to summarize ATS history.");
        return;
      }

      setStatus("ATS history summary ready.");
      setOutput(response.summary.summaryText || JSON.stringify(response.summary, null, 2));
      switchTab("resultTab");
      loadStoredData();
    }
  );
});

document.addEventListener("DOMContentLoaded", () => {
  switchTab("resultTab");
  loadSettings();
  loadStoredData();
});