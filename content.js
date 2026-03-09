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
    ]
  }
};

const ATS_HOST_PATTERNS = [
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)job-boards\.greenhouse\.io$/i,
  /(^|\.)boards\.greenhouse\.io$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)ashbyhq\.com$/i,
  /(^|\.)myworkdayjobs\.com$/i,
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)icims\.com$/i,
  /(^|\.)jobvite\.com$/i,
  /(^|\.)taleo\.net$/i,
  /(^|\.)successfactors\.com$/i
];

const NEGATIVE_HOST_PATTERNS = [
  /(^|\.)google\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)chatgpt\.com$/i,
  /(^|\.)docs\.google\.com$/i,
  /(^|\.)mail\.google\.com$/i,
  /(^|\.)notion\.so$/i,
  /(^|\.)github\.com$/i
];

const JOB_PATH_PATTERNS = [
  /\/jobs?(\/|$)/i,
  /\/careers?(\/|$)/i,
  /\/positions?(\/|$)/i,
  /\/opportunities(\/|$)/i,
  /\/job-description(\/|$)/i,
  /\/requisitions?(\/|$)/i,
  /\/job\//i,
  /\/apply(\/|$)/i
];

const JOB_TEXT_SIGNALS = [
  { label: "Responsibilities", regex: /\bresponsibilities\b/i, weight: 1 },
  { label: "Qualifications", regex: /\bqualifications\b/i, weight: 1 },
  { label: "Minimum Qualifications", regex: /\bminimum qualifications\b/i, weight: 2 },
  { label: "Preferred Qualifications", regex: /\bpreferred qualifications\b/i, weight: 2 },
  { label: "Requirements", regex: /\brequirements\b/i, weight: 1 },
  { label: "Job Description", regex: /\bjob description\b/i, weight: 1 },
  { label: "About the Role", regex: /\babout the role\b/i, weight: 1 },
  { label: "Apply", regex: /\bapply now\b|\bapply for this job\b/i, weight: 2 },
  { label: "Compensation", regex: /\bsalary range\b|\bcompensation\b|\bpay range\b/i, weight: 1 },
  { label: "Benefits", regex: /\bbenefits\b/i, weight: 1 },
  { label: "Employment Type", regex: /\bfull[- ]time\b|\bpart[- ]time\b|\bintern(ship)?\b/i, weight: 1 },
  { label: "Job ID", regex: /\bjob id\b|\breq(?:uisition)? id\b/i, weight: 1 },
  { label: "Work Authorization", regex: /\bwork authorization\b|\bvisa sponsorship\b|\bsponsorship\b/i, weight: 1 },
  { label: "Equal Opportunity", regex: /\bequal opportunity employer\b/i, weight: 1 }
];

let currentConfig = { ...DEFAULT_CONFIG };
let latestScanResults = null;
let latestMatchResult = null;
let parsedResume = null;
let historyCount = 0;
let latestHistorySummary = null;

let currentOverlayTab = "result";
let overlayStatus = "Idle.";
let overlayVisible = false;
let overlayMode = "manual";
let currentPageIntent = {
  autoOpen: false,
  likelyJobPage: false,
  confidence: 0,
  score: 0,
  reason: "",
  matchedSignals: []
};

let mutationObserver = null;
let mutationDebounce = null;
let suppressMutationsUntil = 0;
let lastKnownUrl = location.href;

function getCurrentPageUrl() {
  return location.href;
}

function getPageText(limit = 150000) {
  const bodyText = document.body?.innerText || "";
  return bodyText.replace(/\s+/g, " ").trim().slice(0, limit);
}

function suppressMutationsFor(ms = 250) {
  suppressMutationsUntil = Math.max(suppressMutationsUntil, Date.now() + ms);
}

function isSuppressedMutationWindow() {
  return Date.now() < suppressMutationsUntil;
}

function preserveViewport(fn) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  suppressMutationsFor(300);
  fn();
  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
  });
}

function removeOverlay() {
  preserveViewport(() => {
    document.getElementById("job-filter-overlay")?.remove();
  });
}

function closeOverlay() {
  overlayVisible = false;
  removeOverlay();
  clearHighlights();
}

function setOverlayStatus(text) {
  overlayStatus = text;
  const el = document.getElementById("jf-status-text");
  if (el) el.textContent = text;
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
  return `<div class="jf-tags">${tags.map((t) => `<span class="${className}">${escapeHtml(t)}</span>`).join("")}</div>`;
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
      if (match && match[0]) matchedTerms.add(match[0]);
    }

    results[groupKey] = {
      title: group.title,
      matched: matchedTerms.size > 0,
      terms: Array.from(matchedTerms)
    };
  }

  results.authorization.blocker = detectAuthorizationBlocker(text);
  return results;
}

function hasJobPostingSchema() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent || "";
    if (/"@type"\s*:\s*"JobPosting"/i.test(text)) return true;
  }
  return false;
}

function pageHasApplyButton() {
  const candidates = document.querySelectorAll("a, button, input[type='button'], input[type='submit']");
  for (const el of candidates) {
    const label = `${el.textContent || ""} ${el.getAttribute("value") || ""}`.trim();
    if (/\bapply\b/i.test(label)) return true;
  }
  return false;
}

function pageHasJobMeta() {
  const text = getPageText(40000);
  return /\b(location|department|team|requisition id|job id|employment type|salary range)\b/i.test(text);
}

function detectPageIntent() {
  const host = location.hostname;
  const path = location.pathname;
  const text = getPageText(25000);
  const matchedSignals = [];

  if (!text) {
    return {
      autoOpen: false,
      likelyJobPage: false,
      confidence: 0,
      score: 0,
      reason: "No readable page text.",
      matchedSignals
    };
  }

  if (NEGATIVE_HOST_PATTERNS.some((r) => r.test(host))) {
    return {
      autoOpen: false,
      likelyJobPage: false,
      confidence: 0,
      score: 0,
      reason: "Excluded common non-job site.",
      matchedSignals
    };
  }

  let score = 0;
  let strongSignal = false;

  if (ATS_HOST_PATTERNS.some((r) => r.test(host))) {
    score += 5;
    strongSignal = true;
    matchedSignals.push("Known ATS domain");
  }

  if (JOB_PATH_PATTERNS.some((r) => r.test(path))) {
    score += 2;
    matchedSignals.push("Job-like URL path");
  }

  if (hasJobPostingSchema()) {
    score += 4;
    strongSignal = true;
    matchedSignals.push("JobPosting schema");
  }

  if (pageHasApplyButton()) {
    score += 2;
    matchedSignals.push("Apply button");
  }

  if (pageHasJobMeta()) {
    score += 1;
    matchedSignals.push("Job metadata");
  }

  for (const signal of JOB_TEXT_SIGNALS) {
    if (signal.regex.test(text)) {
      score += signal.weight;
      matchedSignals.push(signal.label);
    }
  }

  const likelyJobPage = strongSignal || score >= 4;
  const autoOpen = currentConfig.showOverlay && (strongSignal || score >= 7);
  const confidence = Math.min(1, score / 9);
  const reason = matchedSignals.length ? matchedSignals.slice(0, 4).join(" · ") : "No strong job-page signals.";

  return {
    autoOpen,
    likelyJobPage,
    confidence,
    score,
    reason,
    matchedSignals
  };
}

function buildIntentSummary() {
  const confidencePct = Math.round((currentPageIntent.confidence || 0) * 100);
  if (overlayMode === "auto") {
    return `Auto mode · ${confidencePct}% confidence · ${escapeHtml(currentPageIntent.reason || "Detected job page")}`;
  }

  if (currentPageIntent.likelyJobPage) {
    return `Manual mode · likely job page · ${confidencePct}% confidence · ${escapeHtml(currentPageIntent.reason)}`;
  }

  return `Manual mode · not auto-detected as a job page · ${escapeHtml(currentPageIntent.reason || "You opened this page manually.")}`;
}

function renderResultTab() {
  const scanResults = latestScanResults || {
    authorization: { matched: false, terms: [], blocker: false },
    degree: { matched: false, terms: [] }
  };
  const auth = scanResults.authorization;
  const degree = scanResults.degree;

  return `
    <div class="jf-summary jf-mode-note">${buildIntentSummary()}</div>

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
      ${auth.blocker ? `<div class="jf-badge jf-badge-red">Possible blocker</div>` : ""}
      ${formatTags(auth.terms)}
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
          <div class="jf-setting-desc">Run keyword detection and ATS analysis on supported pages.</div>
        </div>
        <label class="jf-switch">
          <input type="checkbox" id="jf-setting-enabled" ${currentConfig.enabled ? "checked" : ""} />
          <span class="jf-slider"></span>
        </label>
      </div>

      <div class="jf-setting-row">
        <div class="jf-setting-copy">
          <div class="jf-setting-title">Auto-open detected job pages</div>
          <div class="jf-setting-desc">Show the overlay automatically on high-confidence job/application pages.</div>
        </div>
        <label class="jf-switch">
          <input type="checkbox" id="jf-setting-showOverlay" ${currentConfig.showOverlay ? "checked" : ""} />
          <span class="jf-slider"></span>
        </label>
      </div>

      <div class="jf-setting-row">
        <div class="jf-setting-copy">
          <div class="jf-setting-title">Highlight terms</div>
          <div class="jf-setting-desc">Highlight sponsorship and degree terms when the extension scans a page.</div>
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
  if (!overlayVisible) {
    removeOverlay();
    return;
  }

  let body = "";
  if (currentOverlayTab === "profile") body = renderProfileTab();
  else if (currentOverlayTab === "settings") body = renderSettingsTab();
  else body = renderResultTab();

  preserveViewport(() => {
    const existing = document.getElementById("job-filter-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "job-filter-overlay";
    overlay.innerHTML = `
      <div class="jf-header">
        <div>
          <div class="jf-title">VisaLens</div>
          <div class="jf-subhead">${overlayMode === "auto" ? "Detected Job Page" : "Manual Scan"}</div>
        </div>
        <div class="jf-mode-badge">${overlayMode === "auto" ? "AUTO" : "MANUAL"}</div>
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

    if (!latestScanResults) {
      await scanPage({ forcedByUser: true });
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
  suppressMutationsFor(300);
  document.querySelectorAll("mark.job-filter-highlight").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function shouldSkipNode(node) {
  if (!node.parentElement) return true;
  if (node.parentElement.closest("#job-filter-overlay")) return true;
  if (node.parentElement.closest("mark.job-filter-highlight")) return true;
  const tag = node.parentElement.tagName;
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(tag) || node.parentElement.isContentEditable;
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
    "bs",
    "b.s.",
    "ba",
    "b.a.",
    "master of science",
    "master of arts",
    "master",
    "master's",
    "graduate degree",
    "ms",
    "m.s.",
    "ma",
    "m.a.",
    "meng",
    "m.eng.",
    "mba",
    "phd",
    "ph.d.",
    "doctorate",
    "doctoral"
  ];

  const escaped = phrases
    .sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  return new RegExp(`(${escaped.join("|")})`, "gi");
}

function highlightMatchesInDom() {
  if (!currentConfig.highlightMatches || !document.body) return;

  clearHighlights();
  const regex = buildHighlightRegex();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue || shouldSkipNode(node)) continue;
    regex.lastIndex = 0;
    if (!regex.test(node.nodeValue)) continue;
    regex.lastIndex = 0;
    textNodes.push(node);
  }

  suppressMutationsFor(500);

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
}

async function scanPage({ forcedByUser = false } = {}) {
  if (!currentConfig.enabled && !forcedByUser) return;

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

  if (currentConfig.highlightMatches && (currentPageIntent.likelyJobPage || overlayVisible || forcedByUser)) {
    highlightMatchesInDom();
  } else {
    clearHighlights();
  }

  if (overlayVisible) renderOverlay();
}

async function evaluatePageState({ allowAutoOpen = false, forcedByUser = false } = {}) {
  const previousIntent = currentPageIntent;
  currentPageIntent = detectPageIntent();

  const shouldAutoOpen = currentConfig.enabled && currentPageIntent.autoOpen;

  if (allowAutoOpen && shouldAutoOpen && !overlayVisible) {
    overlayVisible = true;
    overlayMode = "auto";
    setOverlayStatus(`Detected a likely job page. ${currentPageIntent.reason}`);
  }

  if (!currentConfig.enabled) {
    clearHighlights();
    if (overlayMode === "auto") closeOverlay();
    return;
  }

  if (overlayVisible && overlayMode === "manual") {
    await scanPage({ forcedByUser: true });
    return;
  }

  if (shouldAutoOpen && overlayVisible && overlayMode === "auto") {
    if (previousIntent.reason !== currentPageIntent.reason) {
      setOverlayStatus(`Detected a likely job page. ${currentPageIntent.reason}`);
    }
    await scanPage();
    return;
  }

  if (shouldAutoOpen && !overlayVisible) {
    if (allowAutoOpen || previousIntent.autoOpen !== currentPageIntent.autoOpen || lastKnownUrl !== location.href) {
      overlayVisible = true;
      overlayMode = "auto";
      setOverlayStatus(`Detected a likely job page. ${currentPageIntent.reason}`);
      await scanPage();
      return;
    }
  }

  if (!shouldAutoOpen && overlayMode === "auto") {
    closeOverlay();
  }

  if ((currentPageIntent.likelyJobPage || forcedByUser) && overlayVisible) {
    await scanPage({ forcedByUser });
  } else if (!currentPageIntent.likelyJobPage && !overlayVisible) {
    clearHighlights();
  }
}

function scheduleEvaluation() {
  clearTimeout(mutationDebounce);
  mutationDebounce = setTimeout(() => {
    void evaluatePageState({ allowAutoOpen: true });
  }, currentConfig.autoRescanMs);
}

function mutationTouchesOverlayOnly(mutations) {
  return mutations.every((mutation) => {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target && target.closest("#job-filter-overlay")) return true;

    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.every((node) => {
      if (!(node instanceof Element)) return true;
      if (node.id === "job-filter-overlay") return true;
      if (node.closest && node.closest("#job-filter-overlay")) return true;
      if (node.matches?.("mark.job-filter-highlight")) return true;
      return false;
    });
  });
}

function setupMutationObserver() {
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver((mutations) => {
    if (isSuppressedMutationWindow()) return;
    if (mutationTouchesOverlayOnly(mutations)) return;

    const urlChanged = location.href !== lastKnownUrl;
    if (urlChanged) {
      lastKnownUrl = location.href;
      loadStoredMatch();
    }

    scheduleEvaluation();
  });

  mutationObserver.observe(document.documentElement || document.body, {
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
      if (currentOverlayTab === "profile" && overlayVisible) renderOverlay();
    }

    if (changes.highlightMatches && !currentConfig.highlightMatches) {
      clearHighlights();
    }

    if (changes.showOverlay && changes.showOverlay.newValue === false && overlayMode === "auto") {
      closeOverlay();
    }

    if (changed) {
      void evaluatePageState({ allowAutoOpen: true });
    }
  }

  if (area === "local" && changes.atsResultsByUrl) {
    const currentUrl = getCurrentPageUrl();
    const newMap = changes.atsResultsByUrl.newValue || {};
    latestMatchResult = newMap[currentUrl]?.result || null;
    loadHistoryCount().then(() => {
      if (overlayVisible) renderOverlay();
    });
  }

  if (area === "local" && changes.parsedResume) {
    parsedResume = changes.parsedResume.newValue || null;
    if (overlayVisible) renderOverlay();
  }

  if (area === "local" && changes.atsHistory) {
    historyCount = Array.isArray(changes.atsHistory.newValue) ? changes.atsHistory.newValue.length : 0;
    if (overlayVisible) renderOverlay();
  }
});

async function openOverlay(mode = "manual") {
  overlayVisible = true;
  overlayMode = mode;
  currentOverlayTab = "result";

  if (mode === "auto") {
    setOverlayStatus(`Detected a likely job page. ${currentPageIntent.reason}`);
    renderOverlay();
    await scanPage();
  } else {
    setOverlayStatus(currentPageIntent.likelyJobPage ? `Manual scan opened. ${currentPageIntent.reason}` : "Manual scan opened on a page that was not auto-detected as a job posting.");
    renderOverlay();
    await scanPage({ forcedByUser: true });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "ATS_MATCH_RESULT_UPDATED") {
      const payloadUrl = message.payload?.pageUrl || "";
      if (payloadUrl === getCurrentPageUrl()) {
        latestMatchResult = message.payload?.matchResult || null;
        currentOverlayTab = "result";
        setOverlayStatus("Match complete.");
        await loadHistoryCount();
        if (overlayVisible) renderOverlay();
      }
      sendResponse?.({ ok: true });
      return;
    }

    if (["TOGGLE_OVERLAY", "OPEN_OVERLAY", "HIDE_OVERLAY", "MINIMIZE_OVERLAY", "RESTORE_OVERLAY"].includes(message.type)) {
      currentPageIntent = detectPageIntent();
    }

    if (message.type === "TOGGLE_OVERLAY") {
      if (overlayVisible) {
        closeOverlay();
        sendResponse?.({ ok: true, visible: false });
        return;
      }

      const mode = currentPageIntent.autoOpen ? "auto" : "manual";
      await openOverlay(mode);
      sendResponse?.({ ok: true, visible: true, mode });
      return;
    }

    if (message.type === "OPEN_OVERLAY") {
      const mode = message.payload?.mode || (currentPageIntent.autoOpen ? "auto" : "manual");
      await openOverlay(mode);
      sendResponse?.({ ok: true, visible: true, mode });
      return;
    }

    if (message.type === "HIDE_OVERLAY" || message.type === "MINIMIZE_OVERLAY") {
      closeOverlay();
      sendResponse?.({ ok: true, visible: false });
      return;
    }

    if (message.type === "RESTORE_OVERLAY") {
      const mode = currentPageIntent.autoOpen ? "auto" : "manual";
      await openOverlay(mode);
      sendResponse?.({ ok: true, visible: true, mode });
    }
  })();

  return true;
});

(async function init() {
  await loadConfig();
  await loadStoredMatch();
  await loadParsedResume();
  await loadHistoryCount();

  currentOverlayTab = "result";
  setOverlayStatus("Idle.");
  lastKnownUrl = location.href;

  const boot = async () => {
    currentPageIntent = detectPageIntent();
    if (currentConfig.enabled && currentPageIntent.autoOpen) {
      await openOverlay("auto");
    } else {
      clearHighlights();
    }
    setupMutationObserver();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void boot();
    }, { once: true });
  } else {
    await boot();
  }
})();
