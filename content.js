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
let latestMatchResult = null;
let overlayDismissedForThisPage = false;
let latestScanResults = null;
let currentOverlayTab = "result";

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
  overlayDismissedForThisPage = true;
  removeOverlay();
}

function formatTags(tags, className = "jf-tag") {
  if (!Array.isArray(tags) || !tags.length) return "";
  return `<div class="jf-tags">${tags.map(t => `<span class="${className}">${escapeHtml(t)}</span>`).join("")}</div>`;
}

function renderResultTab(scanResults, matchResult) {
  const auth = scanResults?.authorization || { matched: false, terms: [], blocker: false };
  const degree = scanResults?.degree || { matched: false, terms: [] };

  return `
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
      matchResult
        ? `
        <div class="jf-section">
          <div class="jf-label">ATS Match</div>
          <div class="jf-score-row">
            <div class="jf-score-box">
              <div class="jf-score-number">${escapeHtml(String(matchResult.match_score ?? "-"))}</div>
              <div class="jf-score-caption">Overall</div>
            </div>
            <div class="jf-score-box">
              <div class="jf-score-number">${escapeHtml(String(matchResult.skills_score ?? "-"))}</div>
              <div class="jf-score-caption">Skills</div>
            </div>
            <div class="jf-score-box">
              <div class="jf-score-number">${escapeHtml(String(matchResult.degree_score ?? "-"))}</div>
              <div class="jf-score-caption">Degree</div>
            </div>
          </div>

          <div class="jf-mini-line"><strong>Verdict:</strong> ${escapeHtml(matchResult.verdict || "N/A")}</div>
          <div class="jf-mini-line"><strong>Degree fit:</strong> ${escapeHtml(matchResult.degree_fit || "N/A")}</div>
          <div class="jf-mini-line"><strong>Auth risk:</strong> ${escapeHtml(matchResult.authorization_risk || "N/A")}</div>

          ${
            Array.isArray(matchResult.skills_matched) && matchResult.skills_matched.length
              ? `
              <div class="jf-subtitle">Matched skills</div>
              ${formatTags(matchResult.skills_matched.slice(0, 8))}
              `
              : ""
          }

          ${
            Array.isArray(matchResult.skills_missing) && matchResult.skills_missing.length
              ? `
              <div class="jf-subtitle">Missing skills</div>
              ${formatTags(matchResult.skills_missing.slice(0, 8), "jf-tag jf-tag-warn")}
              `
              : ""
          }

          ${
            matchResult.ats_summary
              ? `<div class="jf-summary">${escapeHtml(matchResult.ats_summary)}</div>`
              : ""
          }
        </div>
      `
        : `
        <div class="jf-section">
          <div class="jf-empty">
            No ATS result for this page yet. Use the extension popup to run a match.
          </div>
        </div>
      `
    }
  `;
}

function renderProfileTab(profile) {
  if (!profile) {
    return `
      <div class="jf-section">
        <div class="jf-empty">
          No parsed resume yet. Upload and parse a PDF from the extension popup first.
        </div>
      </div>
    `;
  }

  const degrees = Array.isArray(profile.degrees) ? profile.degrees.slice(0, 5) : [];
  const skills = Array.isArray(profile.skills) ? profile.skills.slice(0, 10) : [];
  const langs = Array.isArray(profile.programming_languages) ? profile.programming_languages.slice(0, 8) : [];
  const frameworks = Array.isArray(profile.frameworks) ? profile.frameworks.slice(0, 8) : [];

  return `
    <div class="jf-section">
      <div class="jf-label">Candidate</div>
      <div class="jf-profile-name">${escapeHtml(profile.name || "Unknown candidate")}</div>
      ${
        profile.summary
          ? `<div class="jf-summary">${escapeHtml(profile.summary)}</div>`
          : ""
      }
    </div>

    ${
      degrees.length
        ? `<div class="jf-section"><div class="jf-label">Degrees</div>${formatTags(degrees)}</div>`
        : ""
    }

    ${
      skills.length
        ? `<div class="jf-section"><div class="jf-label">Skills</div>${formatTags(skills)}</div>`
        : ""
    }

    ${
      langs.length
        ? `<div class="jf-section"><div class="jf-label">Languages</div>${formatTags(langs)}</div>`
        : ""
    }

    ${
      frameworks.length
        ? `<div class="jf-section"><div class="jf-label">Frameworks</div>${formatTags(frameworks)}</div>`
        : ""
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

function renderOverlay(scanResults, matchResult = latestMatchResult, profile = null) {
  removeOverlay();

  if (!currentConfig.showOverlay) return;
  if (overlayDismissedForThisPage) return;

  const overlay = document.createElement("div");
  overlay.id = "job-filter-overlay";

  let panelContent = "";
  if (currentOverlayTab === "profile") {
    panelContent = renderProfileTab(profile);
  } else if (currentOverlayTab === "settings") {
    panelContent = renderSettingsTab();
  } else {
    panelContent = renderResultTab(scanResults, matchResult);
  }

  overlay.innerHTML = `
    <div class="jf-header">
      <div class="jf-title">JobLens ATS</div>
      <button class="jf-close" title="Close">×</button>
    </div>

    <div class="jf-tabs">
      <button class="jf-tab ${currentOverlayTab === "result" ? "active" : ""}" data-tab="result">Result</button>
      <button class="jf-tab ${currentOverlayTab === "profile" ? "active" : ""}" data-tab="profile">Profile</button>
      <button class="jf-tab ${currentOverlayTab === "settings" ? "active" : ""}" data-tab="settings">Settings</button>
    </div>

    <div class="jf-body">
      ${panelContent}
    </div>
  `;

  overlay.querySelector(".jf-close").addEventListener("click", dismissOverlayForCurrentPage);

  overlay.querySelectorAll(".jf-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentOverlayTab = btn.dataset.tab || "result";
      renderOverlay(latestScanResults, latestMatchResult, window.__joblensParsedResume || null);
    });
  });

  const enabledInput = overlay.querySelector("#jf-setting-enabled");
  const showOverlayInput = overlay.querySelector("#jf-setting-showOverlay");
  const highlightInput = overlay.querySelector("#jf-setting-highlightMatches");

  if (enabledInput) {
    enabledInput.addEventListener("change", (e) => {
      chrome.storage.sync.set({ enabled: e.target.checked });
    });
  }

  if (showOverlayInput) {
    showOverlayInput.addEventListener("change", (e) => {
      chrome.storage.sync.set({ showOverlay: e.target.checked });
      if (!e.target.checked) {
        removeOverlay();
      }
    });
  }

  if (highlightInput) {
    highlightInput.addEventListener("change", (e) => {
      chrome.storage.sync.set({ highlightMatches: e.target.checked });
    });
  }

  document.documentElement.appendChild(overlay);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

  const results = collectMatches(text);
  latestScanResults = results;

  chrome.storage.local.set({
    lastScan: {
      url: location.href,
      title: document.title,
      scannedAt: new Date().toISOString(),
      results: latestScanResults
    }
  });

  highlightMatchesInDom();
  renderOverlay(results, latestMatchResult, window.__joblensParsedResume || null);
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
    chrome.storage.sync.get(DEFAULT_CONFIG, (data) => {
      currentConfig = { ...DEFAULT_CONFIG, ...data };
      resolve();
    });
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
      window.__joblensParsedResume = data.parsedResume || null;
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

    if (changes.showOverlay && changes.showOverlay.newValue === false) {
      removeOverlay();
    }

    if (changes.showOverlay && changes.showOverlay.newValue === true) {
      overlayDismissedForThisPage = false;
    }

    if (changed) scheduleScan();
  }

  if (area === "local" && changes.atsResultsByUrl) {
    const currentUrl = getCurrentPageUrl();
    const newMap = changes.atsResultsByUrl.newValue || {};
    latestMatchResult = newMap[currentUrl]?.result || null;
    scheduleScan();
  }

  if (area === "local" && changes.parsedResume) {
    window.__joblensParsedResume = changes.parsedResume.newValue || null;
    if (latestScanResults) {
      renderOverlay(latestScanResults, latestMatchResult, window.__joblensParsedResume || null);
    }
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "ATS_MATCH_RESULT_UPDATED") {
    const payloadUrl = message.payload?.pageUrl || "";
    if (payloadUrl === getCurrentPageUrl()) {
      latestMatchResult = message.payload?.matchResult || null;
      currentOverlayTab = "result";
      scheduleScan();
    }
  }

  if (message.type === "RESET_PAGE_OVERLAY_DISMISS") {
    overlayDismissedForThisPage = false;
    scheduleScan();
  }
});

(async function init() {
  await loadConfig();
  await loadStoredMatch();
  await loadParsedResume();

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