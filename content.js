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
      // Bachelor
      /\bbachelor'?s?\b/i,
      /\bbachelor\s+of\s+science\b/i,
      /\bbachelor\s+of\s+arts\b/i,
      /\bundergraduate\b/i,
      /\bbs\b/i,
      /\bb\.s\.\b/i,
      /\bba\b/i,
      /\bb\.a\.\b/i,

      // Master
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

      // PhD / Doctoral
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

  return results;
}

function removeOverlay() {
  const existing = document.getElementById("job-filter-overlay");
  if (existing) existing.remove();
}

function renderOverlay(results) {
  removeOverlay();
  if (!currentConfig.showOverlay) return;

  const overlay = document.createElement("div");
  overlay.id = "job-filter-overlay";

  const auth = results.authorization;
  const degree = results.degree;

  overlay.innerHTML = `
    <div class="jf-header">
      <div class="jf-title">Job Filter</div>
      <button class="jf-close" title="Close">×</button>
    </div>

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
      ${
        degree.terms.length
          ? `<div class="jf-tags">${degree.terms.map(t => `<span class="jf-tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
    </div>
  `;

  overlay.querySelector(".jf-close").addEventListener("click", () => overlay.remove());
  document.documentElement.appendChild(overlay);
}

function escapeHtml(str) {
  return str
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

    // degree terms
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
    if (!node.nodeValue || !regex.test(node.nodeValue) || shouldSkipNode(node)) continue;
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

function scanPage() {
  if (!currentConfig.enabled) return;

  const text = getPageText();
  if (!text) return;

  const results = collectMatches(text);
  renderOverlay(results);
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
  const data = await chrome.storage.sync.get(DEFAULT_CONFIG);
  currentConfig = { ...DEFAULT_CONFIG, ...data };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  let changed = false;
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (changes[key]) {
      currentConfig[key] = changes[key].newValue;
      changed = true;
    }
  }

  if (changed) scheduleScan();
});

(async function init() {
  await loadConfig();
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