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

            // 保留最近 500 条
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

          sendResponse({
            ok: true,
            summary
          });
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

    if (scan.authorization?.matched) {
      ruleStats.authorizationMentioned += 1;
    }
    if (scan.authorization?.blocker) {
      ruleStats.authorizationBlocker += 1;
    }

    const degreeLower = degreeTerms.toLowerCase();
    if (
      /\bbachelor\b|\bbachelor's\b|\bbachelor of science\b|\bbachelor of arts\b|\bbs\b|\bb\.s\.\b|\bba\b|\bb\.a\.\b/i.test(degreeLower)
    ) {
      ruleStats.bachelorMentioned += 1;
    }
    if (
      /\bmaster\b|\bmaster's\b|\bmaster of science\b|\bmaster of arts\b|\bms\b|\bm\.s\.\b|\bma\b|\bm\.a\.\b|\bmeng\b|\bm\.eng\.\b|\bmba\b/i.test(degreeLower)
    ) {
      ruleStats.masterMentioned += 1;
    }
    if (
      /\bphd\b|\bph\.d\.\b|\bdoctorate\b|\bdoctoral\b|\bdoctor of philosophy\b/i.test(degreeLower)
    ) {
      ruleStats.phdMentioned += 1;
    }
  }

  const lines = [];
  lines.push(`Processed ${total} ATS record${total === 1 ? "" : "s"}.`);

  for (const [label, count] of Object.entries(keywordStats)) {
    if (count > 0) {
      lines.push(`${label} appeared in ${count}/${total} jobs (${percent(count, total)}%).`);
    }
  }

  lines.push(
    `Sponsorship-related terms appeared in ${ruleStats.authorizationMentioned}/${total} jobs (${percent(ruleStats.authorizationMentioned, total)}%).`
  );
  lines.push(
    `Potential authorization blockers appeared in ${ruleStats.authorizationBlocker}/${total} jobs (${percent(ruleStats.authorizationBlocker, total)}%).`
  );
  lines.push(
    `Bachelor-related terms appeared in ${ruleStats.bachelorMentioned}/${total} jobs (${percent(ruleStats.bachelorMentioned, total)}%).`
  );
  lines.push(
    `Master-related terms appeared in ${ruleStats.masterMentioned}/${total} jobs (${percent(ruleStats.masterMentioned, total)}%).`
  );
  lines.push(
    `PhD-related terms appeared in ${ruleStats.phdMentioned}/${total} jobs (${percent(ruleStats.phdMentioned, total)}%).`
  );

  return {
    totalRecords: total,
    keywordStats,
    ruleStats,
    summaryText: lines.join("\n")
  };
}

function percent(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}