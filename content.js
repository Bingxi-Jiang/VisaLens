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

let currentConfig = { ...DEFAULT_CONFIG };
let rescanTimer = null;
let mutationDebounce = null;
let latestMatchResult = null;

function getPageText() {
  const bodyText = document.body?.innerText || "";
  return bodyText.replace(/\s+/g, " ").trim();
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

  results.authorization.blocker = detectAuthorizationBlocker(text);
  return results;
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

function removeOverlay() {
  const existing = document.getElementById("job-filter-overlay");
  if (existing) existing.remove();
}

function renderOverlay(scanResults, matchResult = latestMatchResult) {
  removeOverlay();
  if (!currentConfig.showOverlay) return;

  const overlay = document.createElement("div");
  overlay.id = "job-filter-overlay";

  const auth = scanResults.authorization;
  const degree = scanResults.degree;

  overlay.innerHTML = `
    <div class="jf-header">
      <div class="jf-title">JobLens ATS</div>
      <button class="jf-close" title="Close">×</button>
    </div>

    <div class="jf-section">
      <div class="jf-label">Work Auth / Sponsorship</div>
      <div class="jf-status ${auth.matched ? "jf-hit" : "jf-miss"}">
        ${auth.matched ? "Matched" : "No match"}
      </div>
      ${auth.blocker ? `<div class="jf-badge jf-badge-red">Possible blocker</div>` : ""}
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
      ${
        degree.terms.length
          ? `<div class="jf-tags">${degree.terms.map(t => `<span class="jf-tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
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
            Array.isArray(matchResult.skills_missing) && matchResult.skills_missing.length
              ? `
              <div class="jf-subtitle">Missing skills</div>
              <div class="jf-tags">${matchResult.skills_missing.slice(0, 8).map(t => `<span class="jf-tag jf-tag-warn">${escapeHtml(t)}</span>`).join("")}</div>
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
        : ""
    }
  `;

  overlay.querySelector(".jf-close").addEventListener("click", () => overlay.remove());
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
    "doctor of philosophy",
    "phd",
    "ph.d.",
    "doctorate",
    "doctoral"
  ];

  const escaped = phrases
    .sort((a, b) => b.length - a.length)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
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
}

async function scanPage() {
  if (!currentConfig.enabled) return;

  const text = getPageText();
  if (!text) return;

  const results = collectMatches(text);
  renderOverlay(results, latestMatchResult);
  highlightMatchesInDom();

  chrome.storage.local.set({
    lastScan: {
      url: location.href,
      title: document.title,
      scannedAt: new Date().toISOString(),
      results
    }
  });
}

function scheduleScan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(scanPage, 300);
}

function setupMutationObserver() {
  const observer = new MutationObserver(() => {
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
    chrome.storage.local.get(["lastMatchResult"], (data) => {
      latestMatchResult = data.lastMatchResult || null;
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
    if (changed) scheduleScan();
  }

  if (area === "local" && changes.lastMatchResult) {
    latestMatchResult = changes.lastMatchResult.newValue || null;
    scheduleScan();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "ATS_MATCH_RESULT_UPDATED") {
    latestMatchResult = message.payload?.matchResult || null;
    scheduleScan();
  }
});

(async function init() {
  await loadConfig();
  await loadStoredMatch();
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