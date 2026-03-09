import { uploadPdfToGemini, generateWithPdf, generateFromText, extractJsonText } from "./gemini.js";
import { RESUME_PARSE_PROMPT, buildMatchPrompt } from "./prompts.js";

chrome.runtime.onInstalled.addListener(() => {
  const defaults = {
    enabled: true,
    highlightMatches: true,
    showOverlay: true,
    autoRescanMs: 1200
  };

  chrome.storage.sync.get(null, (result) => {
    const merged = {
      enabled: result.enabled ?? defaults.enabled,
      highlightMatches: result.highlightMatches ?? defaults.highlightMatches,
      showOverlay: result.showOverlay ?? defaults.showOverlay,
      autoRescanMs: result.autoRescanMs ?? defaults.autoRescanMs
    };

    chrome.storage.sync.set(merged);
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
  } catch (error) {
    console.warn("Failed to toggle VisaLens overlay:", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "PARSE_RESUME_PDF": {
          const { fileName, mimeType, fileDataBase64 } = message.payload;
          const blob = base64ToBlob(fileDataBase64, mimeType || "application/pdf");
          const file = new File([blob], fileName || "resume.pdf", {
            type: mimeType || "application/pdf"
          });

          const uploadedFile = await uploadPdfToGemini(file);
          const parsedResponse = await generateWithPdf(
            uploadedFile.uri,
            uploadedFile.mimeType || file.type,
            RESUME_PARSE_PROMPT
          );

          const parsedText = extractJsonText(parsedResponse);
          const parsedResume = JSON.parse(parsedText);

          await chrome.storage.local.set({
            uploadedResumeFile: uploadedFile,
            parsedResume,
            parsedResumeAt: new Date().toISOString()
          });

          sendResponse({
            ok: true,
            uploadedFile,
            parsedResume
          });
          break;
        }

        case "MATCH_CURRENT_JOB": {
          const { pageText, pageUrl, pageTitle, scanResults } = message.payload;

          const localData = await chrome.storage.local.get([
            "parsedResume",
            "atsResultsByUrl",
            "atsHistory"
          ]);

          if (!localData.parsedResume) {
            throw new Error("No parsed resume found. Please upload and parse a PDF first.");
          }

          const prompt = buildMatchPrompt(
            localData.parsedResume,
            String(pageText || "").slice(0, 120000)
          );

          const matchResponse = await generateFromText(prompt);
          const matchText = extractJsonText(matchResponse);
          const matchResult = JSON.parse(matchText);

          const atsResultsByUrl = localData.atsResultsByUrl || {};
          if (pageUrl) {
            atsResultsByUrl[pageUrl] = {
              url: pageUrl,
              title: pageTitle || "",
              matchedAt: new Date().toISOString(),
              result: matchResult,
              scanResults: scanResults || null
            };
          }

          const atsHistory = Array.isArray(localData.atsHistory) ? localData.atsHistory : [];
          if (pageUrl) {
            const newEntry = {
              url: pageUrl,
              title: pageTitle || "",
              matchedAt: new Date().toISOString(),
              result: matchResult,
              scanResults: scanResults || null
            };

            const filtered = atsHistory.filter((item) => item.url !== pageUrl);
            filtered.unshift(newEntry);
            const trimmed = filtered.slice(0, 500);

            await chrome.storage.local.set({
              atsResultsByUrl,
              atsHistory: trimmed,
              lastMatchAt: new Date().toISOString()
            });
          } else {
            await chrome.storage.local.set({
              atsResultsByUrl,
              lastMatchAt: new Date().toISOString()
            });
          }

          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: "ATS_MATCH_RESULT_UPDATED",
              payload: {
                pageUrl,
                matchResult
              }
            });
          }

          sendResponse({
            ok: true,
            matchResult
          });
          break;
        }

        case "GET_STORED_DATA": {
          const { pageUrl } = message.payload || {};

          const data = await chrome.storage.local.get([
            "parsedResume",
            "parsedResumeAt",
            "uploadedResumeFile",
            "lastScan",
            "atsResultsByUrl",
            "atsHistory"
          ]);

          let currentPageMatchResult = null;
          if (pageUrl && data.atsResultsByUrl && data.atsResultsByUrl[pageUrl]) {
            currentPageMatchResult = data.atsResultsByUrl[pageUrl].result;
          }

          sendResponse({
            ok: true,
            data: {
              parsedResume: data.parsedResume || null,
              parsedResumeAt: data.parsedResumeAt || null,
              uploadedResumeFile: data.uploadedResumeFile || null,
              lastScan: data.lastScan || null,
              atsHistory: data.atsHistory || [],
              currentPageMatchResult
            }
          });
          break;
        }

        case "SUMMARIZE_ATS_HISTORY": {
          const data = await chrome.storage.local.get(["atsHistory"]);
          const atsHistory = Array.isArray(data.atsHistory) ? data.atsHistory : [];
          const summary = summarizeAtsHistory(atsHistory);

          sendResponse({ ok: true, summary });
          break;
        }

        default:
          sendResponse({ ok: false, error: "Unknown message type." });
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  return true;
});

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);

  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function summarizeAtsHistory(history) {
  const total = history.length;

  if (!total) {
    return {
      totalRecords: 0,
      keywordStats: {},
      ruleStats: {},
      summaryText: "No ATS history yet."
    };
  }

  const keywordPatterns = {
    Python: /\bpython\b/i,
    Java: /\bjava\b/i,
    "C++": /\bc\+\+\b/i,
    SQL: /\bsql\b/i,
    JavaScript: /\bjavascript\b/i,
    TypeScript: /\btypescript\b/i,
    React: /\breact\b/i,
    Node: /\bnode(\.js)?\b/i,
    AWS: /\baws\b/i,
    Docker: /\bdocker\b/i,
    Kubernetes: /\bkubernetes\b/i,
    Spark: /\bspark\b/i,
    ML: /\b(machine learning|ml)\b/i,
    LLM: /\b(llm|large language model)\b/i
  };

  const keywordStats = {};
  for (const key of Object.keys(keywordPatterns)) {
    keywordStats[key] = 0;
  }

  const ruleStats = {
    authorizationMentioned: 0,
    authorizationBlocker: 0,
    bachelorMentioned: 0,
    masterMentioned: 0,
    phdMentioned: 0
  };

  for (const entry of history) {
    const resultText = JSON.stringify(entry.result || {});
    const scan = entry.scanResults || {};
    const degreeTerms = (scan.degree?.terms || []).join(" ");
    const authTerms = (scan.authorization?.terms || []).join(" ");
    const combinedText = `${resultText} ${degreeTerms} ${authTerms}`;

    for (const [label, regex] of Object.entries(keywordPatterns)) {
      if (regex.test(combinedText)) {
        keywordStats[label] += 1;
      }
    }

    if (scan.authorization?.matched) ruleStats.authorizationMentioned += 1;
    if (scan.authorization?.blocker) ruleStats.authorizationBlocker += 1;
    if (/\bbachelor/i.test(combinedText)) ruleStats.bachelorMentioned += 1;
    if (/\bmaster/i.test(combinedText)) ruleStats.masterMentioned += 1;
    if (/\bph\.?d/i.test(combinedText)) ruleStats.phdMentioned += 1;
  }

  const topKeywords = Object.entries(keywordStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} (${count})`);

  const summaryText = [
    `Scanned ${total} job pages.`,
    ruleStats.authorizationMentioned
      ? `Authorization language appeared in ${ruleStats.authorizationMentioned} postings, with ${ruleStats.authorizationBlocker} likely blockers.`
      : "No authorization language detected yet.",
    topKeywords.length ? `Top recurring skills/signals: ${topKeywords.join(", ")}.` : "No recurring skill signals yet.",
    `Degree mentions — bachelor's: ${ruleStats.bachelorMentioned}, master's: ${ruleStats.masterMentioned}, PhD: ${ruleStats.phdMentioned}.`
  ].join(" ");

  return {
    totalRecords: total,
    keywordStats,
    ruleStats,
    summaryText
  };
}
