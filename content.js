const DEFAULT_CONFIG = {
  enabled: true,
  highlightMatches: true,
  showOverlay: true,
  autoRescanMs: 1200
};

const KEYWORD_GROUPS = {
  authorization: {
    title: "Work Authorization / Sponsorship",
    keywords: [
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
    ]
  },
  degree: {
    title: "Degree Requirements",
    keywords: [
      /\bbachelor'?s?\b/i,
      /\bundergraduate\b/i,
      /\bbs\b/i,
      /\bb\.s\.\b/i,
      /\bba\b/i,
      /\bb\.a\.\b/i,
      /\bmaster'?s?\b/i,
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
      /\bbs\b/i,
      /\bba\b/i,
      /\bms\b/i,
      /\bma\b/i
    ]
  }
};

let currentConfig = { ...DEFAULT_CONFIG };
let rescanTimer = null;
let mutationDebounce = null;
let observerResumeTimer = null;
let suppressObserverMutations = false;

let latestScanResults = null;
let latestMatchResult = null;
let parsedResume = null;
let historyCount = 0;
let latestHistorySummary = null;

let overlayDismissedForThisPage = false;
let overlayMinimized = false;
let currentOverlayTab = "result";
let overlayStatus = "Idle.";

function getCurrentPageUrl() {
  return location.href;
}

function getPageText() {
  const bodyText = document.body?.innerText || "";
  return bodyText.replace(/\s+/g, " ").trim();
}

function detectAuthorizationBlocker(text) {
  const blockerPatterns = [
    /\bno\s+sponsorship\b/i,
    /\bwill\s+not\s+sponsor\b/i,
    /\bmust\s+be\s+authorized\s+to\s+work\b/i,
    /\bwithout\s+(current\s+or\s+future\s+)?sponsorship\b/i,
    /\bcitizenship\s+required\b/i,
    /\bus\s+citizen(ship)?\s+required\b/i,
    /\bsecurity\s+clearance\s+required\b/i
  ];
  return blockerPatterns.some((r) => r.test(text));
}

function collectMatches(text) {
  const results = {};

  for (const [groupKey, group] of Object.entries(KEYWORD_GROUPS)) {
    const matchedTerms = new Set();

    for (const regex of group.keywords) {
      const match = text.match(regex);
      if (match && match[0]) {
        matchedTerms.add(match[0]);
      }
    }

    results[groupKey] = {
      title: group.title,
      matched: matchedTerms.size > 0,
      terms: Array.from(matchedTerms)
    };
  }

  return results;
}

function removeOverlay() {
  document.getElementById("job-filter-overlay")?.remove();
}

function withObserverSuppressed(fn) {
  suppressObserverMutations = true;
  clearTimeout(observerResumeTimer);

  try {
    return fn();
  } finally {
    observerResumeTimer = setTimeout(() => {
      suppressObserverMutations = false;
    }, 400);
  }
}

function preservePageScroll(fn) {
  const x = window.scrollX;
  const y = window.scrollY;
  const result = fn();

  requestAnimationFrame(() => {
    if (window.scrollX !== x || window.scrollY !== y) {
      window.scrollTo(x, y);
    }
  });

  return result;
}

function setOverlayStatus(text) {
  overlayStatus = text;
  const el = document.getElementById("jf-status-text");
  if (el) el.textContent = text;
}

function dismissOverlayForCurrentPage() {
  overlayDismissedForThisPage = false;
  overlayMinimized = true;
  renderOverlay();
}

function minimizeOverlay() {
  overlayDismissedForThisPage = false;
  overlayMinimized = true;
  renderOverlay();
}

function restoreOverlay() {
  overlayDismissedForThisPage = false;
  overlayMinimized = false;
  renderOverlay();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTags(tags, className = "jf-tag") {
  if (!Array.isArray(tags) || !tags.length) return "";
  return `<div class="jf-tags">${tags.map(t => `<span class="${className}">${escapeHtml(t)}</span>`).join("")}</div>`;
}

function renderResultTab() {
  const scanResults = latestScanResults || {
    authorization: { matched: false, terms: [], blocker: false },
    degree: { matched: false, terms: [] }
  };
  const auth = scanResults.authorization;
  const degree = scanResults.degree;

  return `
    <div class="jf-action-row">
      <button class="jf-button" id="jf-match-btn">Match This Page</button>
      <button class="jf-button secondary" id="jf-summary-btn">Summarize ATS History</button>
    </div>

    <div class="jf-meta-line">ATS history count: ${historyCount}</div>

    <div class="jf-section">
      <div class="jf-label">Work Auth / Sponsorship</div>
      <div class="jf-status ${auth.matched ? "jf-hit" : "jf-miss"}">
        ${auth.matched ? "Matched" : "No match"}
      </div>
      ${
        auth.terms.length
          ? `<div class="jf-tags">${auth.terms.map(t => `<span class="jf-tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
    </div>

    <div class="jf-section">
      <div class="jf-label">Degree</div>
      <div class="jf-status ${degree.matched ? "jf-hit" : "jf-miss"}">
        ${degree.matched ? "Matched" : "No match"}
      </div>
      ${formatTags(degree.terms)}
    </div>

    ${
      latestMatchResult
        ? `
        <div class="jf-section">
          <div class="jf-label">ATS Match</div>
          <div class="jf-score-row">
            <div class="jf-score-box">
              <div class="jf-score-number">${escapeHtml(String(latestMatchResult.match_score ?? "-"))}</div>
              <div class="jf-score-caption">Overall</div>
            </div>
            <div class="jf-score-box">
              <div class="jf-score-number">${escapeHtml(String(latestMatchResult.skills_score ?? "-"))}</div>
              <div class="jf-score-caption">Skills</div>
            </div>
            <div class="jf-score-box">
              <div class="jf-score-number">${escapeHtml(String(latestMatchResult.degree_score ?? "-"))}</div>
              <div class="jf-score-caption">Degree</div>
            </div>
          </div>

          <div class="jf-mini-line"><strong>Verdict:</strong> ${escapeHtml(latestMatchResult.verdict || "N/A")}</div>
          <div class="jf-mini-line"><strong>Degree fit:</strong> ${escapeHtml(latestMatchResult.degree_fit || "N/A")}</div>
          <div class="jf-mini-line"><strong>Auth risk:</strong> ${escapeHtml(latestMatchResult.authorization_risk || "N/A")}</div>

          ${
            Array.isArray(latestMatchResult.skills_matched) && latestMatchResult.skills_matched.length
              ? `
              <div class="jf-subtitle">Matched skills</div>
              ${formatTags(latestMatchResult.skills_matched.slice(0, 8))}
              `
              : ""
          }

          ${
            Array.isArray(latestMatchResult.skills_missing) && latestMatchResult.skills_missing.length
              ? `
              <div class="jf-subtitle">Missing skills</div>
              ${formatTags(latestMatchResult.skills_missing.slice(0, 8), "jf-tag jf-tag-warn")}
              `
              : ""
          }

          ${
            latestMatchResult.ats_summary
              ? `<div class="jf-summary">${escapeHtml(latestMatchResult.ats_summary)}</div>`
              : ""
          }
        </div>
      `
        : `
        <div class="jf-section">
          <div class="jf-empty">No ATS result for this page yet.</div>
        </div>
      `
    }

    ${
      latestHistorySummary
        ? `
        <div class="jf-section">
          <div class="jf-label">History Summary</div>
          <div class="jf-summary">${escapeHtml(latestHistorySummary)}</div>
        </div>
      `
        : ""
    }
  `;
}

function renderProfileTab() {
  return `
    <div class="jf-section">
      <div class="jf-label">Gemini API Key</div>
      <input class="jf-input" id="jf-api-key-input" type="password" placeholder="Paste your Gemini API key" value="${escapeHtml(window.__joblensGeminiApiKey || "")}" />
      <div class="jf-action-row single">
        <button class="jf-button secondary" id="jf-save-api-key-btn">Save API Key</button>
      </div>
    </div>

    <div class="jf-section">
      <div class="jf-label">Resume PDF</div>
      <input class="jf-file-input" id="jf-resume-input" type="file" accept="application/pdf" />
      <div class="jf-action-row single">
        <button class="jf-button" id="jf-parse-resume-btn">Upload & Parse Resume</button>
      </div>
    </div>

    ${
      parsedResume
        ? `
        <div class="jf-section">
          <div class="jf-label">Candidate</div>
          <div class="jf-profile-name">${escapeHtml(parsedResume.name || "Unknown candidate")}</div>
          ${parsedResume.summary ? `<div class="jf-summary">${escapeHtml(parsedResume.summary)}</div>` : ""}
        </div>

        ${
          Array.isArray(parsedResume.degrees) && parsedResume.degrees.length
            ? `<div class="jf-section"><div class="jf-label">Degrees</div>${formatTags(parsedResume.degrees.slice(0, 5))}</div>`
            : ""
        }

        ${
          Array.isArray(parsedResume.skills) && parsedResume.skills.length
            ? `<div class="jf-section"><div class="jf-label">Skills</div>${formatTags(parsedResume.skills.slice(0, 10))}</div>`
            : ""
        }

        ${
          Array.isArray(parsedResume.programming_languages) && parsedResume.programming_languages.length
            ? `<div class="jf-section"><div class="jf-label">Languages</div>${formatTags(parsedResume.programming_languages.slice(0, 8))}</div>`
            : ""
        }

        ${
          Array.isArray(parsedResume.frameworks) && parsedResume.frameworks.length
            ? `<div class="jf-section"><div class="jf-label">Frameworks</div>${formatTags(parsedResume.frameworks.slice(0, 8))}</div>`
            : ""
        }
      `
        : `
        <div class="jf-section">
          <div class="jf-empty">No parsed resume yet.</div>
        </div>
      `
    }
  `;
}

function renderSettingsTab() {
  return `
    <div class="jf-section">
      <div class="jf-setting-row">
        <div class="jf-setting-copy">
          <div class="jf-setting-title">Enable scanning</div>
          <div class="jf-setting-desc">Run keyword detection on this page.</div>
        </div>
        <label class="jf-switch">
          <input type="checkbox" id="jf-setting-enabled" ${currentConfig.enabled ? "checked" : ""} />
          <span class="jf-slider"></span>
        </label>
      </div>

      <div class="jf-setting-row">
        <div class="jf-setting-copy">
          <div class="jf-setting-title">Show overlay</div>
          <div class="jf-setting-desc">Display this floating panel on pages.</div>
        </div>
        <label class="jf-switch">
          <input type="checkbox" id="jf-setting-showOverlay" ${currentConfig.showOverlay ? "checked" : ""} />
          <span class="jf-slider"></span>
        </label>
      </div>

      <div class="jf-setting-row">
        <div class="jf-setting-copy">
          <div class="jf-setting-title">Highlight terms</div>
          <div class="jf-setting-desc">Highlight sponsorship and degree terms in page text.</div>
        </div>
        <label class="jf-switch">
          <input type="checkbox" id="jf-setting-highlightMatches" ${currentConfig.highlightMatches ? "checked" : ""} />
          <span class="jf-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function renderOverlay() {
  preservePageScroll(() => {
    withObserverSuppressed(() => {
      removeOverlay();

      if (!currentConfig.showOverlay) return;
      if (overlayDismissedForThisPage) return;
      if (overlayMinimized) return;

      const overlay = document.createElement("div");
      overlay.id = "job-filter-overlay";

      let body = "";
      if (currentOverlayTab === "profile") body = renderProfileTab();
      else if (currentOverlayTab === "settings") body = renderSettingsTab();
      else body = renderResultTab();

      overlay.innerHTML = `
        <div class="jf-header">
          <div class="jf-title">JobLens ATS</div>
        </div>

        <div class="jf-tabs">
          <button class="jf-tab ${currentOverlayTab === "result" ? "active" : ""}" data-tab="result">Result</button>
          <button class="jf-tab ${currentOverlayTab === "profile" ? "active" : ""}" data-tab="profile">Profile</button>
          <button class="jf-tab ${currentOverlayTab === "settings" ? "active" : ""}" data-tab="settings">Settings</button>
        </div>

        <div class="jf-status-bar">
          <span id="jf-status-text">${escapeHtml(overlayStatus)}</span>
        </div>

        <div class="jf-body">${body}</div>
      `;

      document.documentElement.appendChild(overlay);

      overlay.querySelectorAll(".jf-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          currentOverlayTab = btn.dataset.tab || "result";
          renderOverlay();
        });
      });

      bindOverlayEvents(overlay);
    });
  });
}

function bindOverlayEvents(root) {
  const matchBtn = root.querySelector("#jf-match-btn");
  const summaryBtn = root.querySelector("#jf-summary-btn");
  const saveApiKeyBtn = root.querySelector("#jf-save-api-key-btn");
  const parseResumeBtn = root.querySelector("#jf-parse-resume-btn");

  const enabledInput = root.querySelector("#jf-setting-enabled");
  const showOverlayInput = root.querySelector("#jf-setting-showOverlay");
  const highlightInput = root.querySelector("#jf-setting-highlightMatches");

  if (matchBtn) matchBtn.addEventListener("click", matchCurrentPageFromOverlay);
  if (summaryBtn) summaryBtn.addEventListener("click", summarizeHistoryFromOverlay);
  if (saveApiKeyBtn) saveApiKeyBtn.addEventListener("click", saveApiKeyFromOverlay);
  if (parseResumeBtn) parseResumeBtn.addEventListener("click", parseResumeFromOverlay);

  if (enabledInput) {
    enabledInput.addEventListener("change", (e) => {
      chrome.storage.sync.set({ enabled: e.target.checked });
    });
  }

  if (showOverlayInput) {
    showOverlayInput.addEventListener("change", (e) => {
      chrome.storage.sync.set({ showOverlay: e.target.checked });
      if (!e.target.checked) removeOverlay();
    });
  }

  if (highlightInput) {
    highlightInput.addEventListener("change", (e) => {
      chrome.storage.sync.set({ highlightMatches: e.target.checked });
    });
  }
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

async function saveApiKeyFromOverlay() {
  const input = document.getElementById("jf-api-key-input");
  const key = input?.value?.trim() || "";
  chrome.storage.sync.set({ geminiApiKey: key }, () => {
    if (chrome.runtime.lastError) {
      setOverlayStatus("Failed to save API key.");
      return;
    }
    window.__joblensGeminiApiKey = key;
    setOverlayStatus(key ? "Gemini API key saved." : "Gemini API key cleared.");
  });
}

async function parseResumeFromOverlay() {
  try {
    const input = document.getElementById("jf-resume-input");
    const file = input?.files?.[0];
    if (!file) throw new Error("Please choose a PDF first.");

    setOverlayStatus("Reading PDF...");
    const base64 = await fileToBase64(file);

    setOverlayStatus("Uploading PDF to Gemini and parsing resume...");
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
          setOverlayStatus("Resume parsing failed.");
          return;
        }
        if (!response?.ok) {
          setOverlayStatus(response?.error || "Resume parsing failed.");
          return;
        }

        parsedResume = response.parsedResume || null;
        currentOverlayTab = "profile";
        setOverlayStatus("Resume parsed successfully.");
        renderOverlay();
      }
    );
  } catch (error) {
    setOverlayStatus(String(error));
  }
}

async function matchCurrentPageFromOverlay() {
  try {
    const pageText = getPageText();
    if (!pageText) {
      setOverlayStatus("Could not read page text.");
      return;
    }

    setOverlayStatus("Matching resume against current page...");
    chrome.runtime.sendMessage(
      {
        type: "MATCH_CURRENT_JOB",
        payload: {
          pageText,
          pageUrl: location.href,
          pageTitle: document.title || "",
          scanResults: latestScanResults
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          setOverlayStatus("Matching failed.");
          return;
        }
        if (!response?.ok) {
          setOverlayStatus(response?.error || "Matching failed.");
          return;
        }

        latestMatchResult = response.matchResult || null;
        currentOverlayTab = "result";
        setOverlayStatus("Match complete.");
        loadHistoryCount().then(renderOverlay);
      }
    );
  } catch (error) {
    setOverlayStatus(String(error));
  }
}

async function summarizeHistoryFromOverlay() {
  setOverlayStatus("Summarizing ATS history...");
  chrome.runtime.sendMessage({ type: "SUMMARIZE_ATS_HISTORY" }, (response) => {
    if (chrome.runtime.lastError) {
      setOverlayStatus("Summary failed.");
      return;
    }
    if (!response?.ok) {
      setOverlayStatus(response?.error || "Summary failed.");
      return;
    }

    latestHistorySummary = response.summary?.summaryText || "";
    currentOverlayTab = "result";
    setOverlayStatus("ATS history summary ready.");
    renderOverlay();
  });
}

function clearHighlights() {
  document.querySelectorAll("mark.job-filter-highlight").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function shouldSkipNode(node) {
  if (!node.parentElement) return true;
  const tag = node.parentElement.tagName;
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(tag);
}

function buildHighlightRegex() {
  const phrases = [
    "no sponsorship",
    "visa sponsorship",
    "work authorization",
    "no work authorization",
    "must be authorized to work",
    "legally authorized to work",
    "authorized to work in the u.s.",
    "current or future need for sponsorship",
    "us citizen",
    "u.s. citizen",
    "citizenship required",
    "permanent resident",
    "green card",
    "opt",
    "cpt",
    "h-1b",
    "sponsor",
    "sponsorship",
    "bachelor of science",
    "bachelor of arts",
    "bachelor",
    "bachelor's",
    "undergraduate",
    "master",
    "master's",
    "phd",
    "ph.d.",
    "doctorate",
    "doctoral",
    "opt",
    "cpt",
    "h-1b",
    "sponsor",
    "sponsorship"
  ];

  const escaped = phrases
    .sort((a, b) => b.length - a.length)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
}

function highlightMatchesInDom() {
  if (!currentConfig.highlightMatches || !document.body) return;

  withObserverSuppressed(() => {
    clearHighlights();
    const regex = buildHighlightRegex();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue || shouldSkipNode(node)) continue;
      if (!regex.test(node.nodeValue)) continue;
      regex.lastIndex = 0;
      textNodes.push(node);
    }

    for (const node of textNodes) {
      const text = node.nodeValue;
      const frag = document.createDocumentFragment();
      let lastIndex = 0;

      text.replace(regex, (match, offset) => {
        if (offset > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
        }

        const mark = document.createElement("mark");
        mark.className = "job-filter-highlight";
        mark.textContent = match;
        frag.appendChild(mark);

        lastIndex = offset + match.length;
        return match;
      });

      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      node.parentNode?.replaceChild(frag, node);
    }
  });
}

function scanPage() {
  if (!currentConfig.enabled) return;

  const text = getPageText();
  if (!text) return;

  latestScanResults = collectMatches(text);

  chrome.storage.local.set({
    lastScan: {
      url: location.href,
      title: document.title,
      scannedAt: new Date().toISOString(),
      results: latestScanResults
    }
  });

  preservePageScroll(() => {
    highlightMatchesInDom();
    renderOverlay();
  });
}

function scheduleScan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(scanPage, 300);
}

function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    if (suppressObserverMutations) return;

    const hasNonOverlayMutation = mutations.some((mutation) => {
      const target = mutation.target instanceof Node ? mutation.target : null;
      if (!target) return true;

      if (target.nodeType === Node.ELEMENT_NODE && target.id === "job-filter-overlay") return false;

      const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
      if (!element) return true;

      if (element.closest?.("#job-filter-overlay")) return false;
      return true;
    });

    if (!hasNonOverlayMutation) return;

    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      scheduleScan();
    }, currentConfig.autoRescanMs);
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });
}

async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        ...DEFAULT_CONFIG,
        geminiApiKey: ""
      },
      (data) => {
        currentConfig = { ...DEFAULT_CONFIG, ...data };
        window.__joblensGeminiApiKey = data.geminiApiKey || "";
        resolve();
      }
    );
  });
}

async function loadStoredMatch() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["atsResultsByUrl"], (data) => {
      const currentUrl = getCurrentPageUrl();
      const map = data.atsResultsByUrl || {};
      latestMatchResult = map[currentUrl]?.result || null;
      resolve();
    });
  });
}

async function loadParsedResume() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["parsedResume"], (data) => {
      parsedResume = data.parsedResume || null;
      resolve();
    });
  });
}

async function loadHistoryCount() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["atsHistory"], (data) => {
      historyCount = Array.isArray(data.atsHistory) ? data.atsHistory.length : 0;
      resolve();
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    let changed = false;

    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (changes[key]) {
        currentConfig[key] = changes[key].newValue;
        changed = true;
      }
    }

    if (changes.geminiApiKey) {
      window.__joblensGeminiApiKey = changes.geminiApiKey.newValue || "";
      if (currentOverlayTab === "profile" && !overlayMinimized && !overlayDismissedForThisPage) {
        renderOverlay();
      }
    }

    if (changes.showOverlay && changes.showOverlay.newValue === false) {
      overlayDismissedForThisPage = false;
      overlayMinimized = false;
      removeOverlay();
    }

    if (changes.showOverlay && changes.showOverlay.newValue === true) {
      overlayDismissedForThisPage = false;
      overlayMinimized = false;
    }

    if (changed) scheduleScan();
  }

  if (area === "local" && changes.atsResultsByUrl) {
    const currentUrl = getCurrentPageUrl();
    const newMap = changes.atsResultsByUrl.newValue || {};
    latestMatchResult = newMap[currentUrl]?.result || null;
    loadHistoryCount().then(scheduleScan);
  }

  if (area === "local" && changes.parsedResume) {
    parsedResume = changes.parsedResume.newValue || null;
    if (!overlayDismissedForThisPage && !overlayMinimized) renderOverlay();
  }

  if (area === "local" && changes.atsHistory) {
    historyCount = Array.isArray(changes.atsHistory.newValue) ? changes.atsHistory.newValue.length : 0;
    if (!overlayDismissedForThisPage && !overlayMinimized) renderOverlay();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ATS_MATCH_RESULT_UPDATED") {
    const payloadUrl = message.payload?.pageUrl || "";
    if (payloadUrl === getCurrentPageUrl()) {
      latestMatchResult = message.payload?.matchResult || null;
      currentOverlayTab = "result";
      overlayDismissedForThisPage = false;
      overlayMinimized = false;
      setOverlayStatus("Match complete.");
      loadHistoryCount().then(renderOverlay);
    }
  }

  if (message.type === "TOGGLE_OVERLAY") {
    if (!currentConfig.showOverlay) {
      currentConfig.showOverlay = true;
      chrome.storage.sync.set({ showOverlay: true });
    }

    if (overlayDismissedForThisPage || overlayMinimized) {
      overlayDismissedForThisPage = false;
      overlayMinimized = false;
    } else {
      overlayDismissedForThisPage = false;
      overlayMinimized = true;
    }

    renderOverlay();
    sendResponse?.({ ok: true, minimized: overlayMinimized, hidden: overlayDismissedForThisPage });
    return true;
  }

  if (message.type === "OPEN_OVERLAY") {
    overlayDismissedForThisPage = false;
    overlayMinimized = false;
    renderOverlay();
    sendResponse?.({ ok: true });
    return true;
  }

  if (message.type === "HIDE_OVERLAY") {
    overlayDismissedForThisPage = false;
    overlayMinimized = true;
    renderOverlay();
    sendResponse?.({ ok: true });
    return true;
  }

  if (message.type === "MINIMIZE_OVERLAY") {
    overlayDismissedForThisPage = false;
    overlayMinimized = true;
    renderOverlay();
    sendResponse?.({ ok: true });
    return true;
  }

  if (message.type === "RESTORE_OVERLAY") {
    restoreOverlay();
    sendResponse?.({ ok: true });
    return true;
  }
});

(async function init() {
  await loadConfig();
  await loadStoredMatch();
  await loadParsedResume();
  await loadHistoryCount();

  overlayDismissedForThisPage = false;
  overlayMinimized = false;
  currentOverlayTab = "result";
  setOverlayStatus("Idle.");

  if (!currentConfig.enabled) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scanPage();
      setupMutationObserver();
    });
  } else {
    scanPage();
    setupMutationObserver();
  }
})();