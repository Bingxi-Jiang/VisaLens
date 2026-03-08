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
          const { pageText, pageUrl, pageTitle } = message.payload;

          const localData = await chrome.storage.local.get(["parsedResume", "atsResultsByUrl"]);
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
              result: matchResult
            };
          }

          await chrome.storage.local.set({
            atsResultsByUrl,
            lastMatchAt: new Date().toISOString()
          });

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
            "atsResultsByUrl"
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
              currentPageMatchResult
            }
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