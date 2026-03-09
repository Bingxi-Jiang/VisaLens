import { uploadPdfToGemini, generateWithPdf, generateFromText, extractJsonText } from "./gemini.js";
import { RESUME_PARSE_PROMPT, buildMatchPrompt } from "./prompts.js";

chrome.runtime.onInstalled.addListener(() => {
  const defaults = {
    enabled: true,
    highlightMatches: true,
    showOverlay: true,
    autoRescanMs: 1200
  };

  chrome.storage.sync.get(null, async (result) => {
    const merged = {
      enabled: result.enabled ?? defaults.enabled,
      highlightMatches: result.highlightMatches ?? defaults.highlightMatches,
      showOverlay: result.showOverlay ?? defaults.showOverlay,
      autoRescanMs: result.autoRescanMs ?? defaults.autoRescanMs
    };

    chrome.storage.sync.set(merged);
    await ensureResumeProfileStorage();
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
          const { fileName, mimeType, fileDataBase64, profileLabel } = message.payload;
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
          const state = await ensureResumeProfileStorage();

          const parsedAt = new Date().toISOString();
          const desiredLabel = buildProfileLabel(profileLabel, fileName, parsedResume);
          const label = uniquifyProfileLabel(desiredLabel, state.resumeProfiles);
          const newProfile = {
            id: createResumeProfileId(),
            label,
            fileName: fileName || "resume.pdf",
            parsedAt,
            uploadedResumeFile: uploadedFile,
            parsedResume
          };

          const resumeProfiles = [newProfile, ...state.resumeProfiles];
          const activeResumeProfileId = newProfile.id;

          await chrome.storage.local.set({
            resumeProfiles,
            activeResumeProfileId,
            parsedResume,
            parsedResumeAt: parsedAt,
            uploadedResumeFile: uploadedFile
          });

          sendResponse({
            ok: true,
            uploadedFile,
            parsedResume,
            profile: newProfile,
            resumeProfiles,
            activeResumeProfileId
          });
          break;
        }

        case "SET_ACTIVE_RESUME_PROFILE": {
          const { profileId } = message.payload || {};
          const state = await ensureResumeProfileStorage();
          const activeProfile = state.resumeProfiles.find((profile) => profile.id === profileId);
          if (!activeProfile) throw new Error("Resume profile not found.");

          await chrome.storage.local.set({
            activeResumeProfileId: activeProfile.id,
            parsedResume: activeProfile.parsedResume || null,
            parsedResumeAt: activeProfile.parsedAt || null,
            uploadedResumeFile: activeProfile.uploadedResumeFile || null
          });

          sendResponse({
            ok: true,
            activeResumeProfileId: activeProfile.id,
            activeProfile,
            resumeProfiles: state.resumeProfiles
          });
          break;
        }

        case "DELETE_RESUME_PROFILE": {
          const { profileId } = message.payload || {};
          const state = await ensureResumeProfileStorage();
          const profileExists = state.resumeProfiles.some((profile) => profile.id === profileId);
          if (!profileExists) throw new Error("Resume profile not found.");

          const resumeProfiles = state.resumeProfiles.filter((profile) => profile.id !== profileId);
          const atsResultsByProfileUrl = { ...(state.atsResultsByProfileUrl || {}) };
          delete atsResultsByProfileUrl[profileId];

          const atsHistory = (state.atsHistory || []).filter((entry) => entry.profileId !== profileId);
          const nextActiveProfile = resumeProfiles.find((profile) => profile.id === state.activeResumeProfileId) || resumeProfiles[0] || null;

          await chrome.storage.local.set({
            resumeProfiles,
            activeResumeProfileId: nextActiveProfile?.id || null,
            parsedResume: nextActiveProfile?.parsedResume || null,
            parsedResumeAt: nextActiveProfile?.parsedAt || null,
            uploadedResumeFile: nextActiveProfile?.uploadedResumeFile || null,
            atsResultsByProfileUrl,
            atsHistory
          });

          sendResponse({
            ok: true,
            resumeProfiles,
            activeResumeProfileId: nextActiveProfile?.id || null,
            activeProfile: nextActiveProfile,
            atsHistory
          });
          break;
        }

        case "MATCH_CURRENT_JOB": {
          const { pageText, pageUrl, pageTitle, scanResults } = message.payload;
          const state = await ensureResumeProfileStorage();
          const activeProfile = state.activeProfile;

          if (!activeProfile?.parsedResume) {
            throw new Error("No active resume profile found. Please upload or select a resume profile first.");
          }

          const prompt = buildMatchPrompt(
            activeProfile.parsedResume,
            String(pageText || "").slice(0, 120000)
          );

          const matchResponse = await generateFromText(prompt);
          const matchText = extractJsonText(matchResponse);
          const matchResult = JSON.parse(matchText);

          const matchedAt = new Date().toISOString();
          const atsResultsByProfileUrl = { ...(state.atsResultsByProfileUrl || {}) };
          const existingProfileMap = { ...(atsResultsByProfileUrl[activeProfile.id] || {}) };

          if (pageUrl) {
            existingProfileMap[pageUrl] = {
              url: pageUrl,
              title: pageTitle || "",
              matchedAt,
              profileId: activeProfile.id,
              profileLabel: activeProfile.label,
              result: matchResult,
              scanResults: scanResults || null
            };
            atsResultsByProfileUrl[activeProfile.id] = existingProfileMap;
          }

          const atsHistory = Array.isArray(state.atsHistory) ? [...state.atsHistory] : [];
          if (pageUrl) {
            const newEntry = {
              url: pageUrl,
              title: pageTitle || "",
              matchedAt,
              profileId: activeProfile.id,
              profileLabel: activeProfile.label,
              result: matchResult,
              scanResults: scanResults || null
            };

            const filtered = atsHistory.filter((item) => !(item.url === pageUrl && item.profileId === activeProfile.id));
            filtered.unshift(newEntry);

            await chrome.storage.local.set({
              atsResultsByProfileUrl,
              atsHistory: filtered.slice(0, 500),
              lastMatchAt: matchedAt
            });
          } else {
            await chrome.storage.local.set({
              atsResultsByProfileUrl,
              lastMatchAt: matchedAt
            });
          }

          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: "ATS_MATCH_RESULT_UPDATED",
              payload: {
                pageUrl,
                profileId: activeProfile.id,
                matchResult
              }
            });
          }

          sendResponse({
            ok: true,
            profileId: activeProfile.id,
            profileLabel: activeProfile.label,
            matchResult
          });
          break;
        }

        case "GET_STORED_DATA": {
          const { pageUrl } = message.payload || {};
          const state = await ensureResumeProfileStorage();
          const profileMap = state.activeProfile?.id ? state.atsResultsByProfileUrl?.[state.activeProfile.id] || {} : {};
          const currentPageMatchResult = pageUrl ? profileMap[pageUrl]?.result || null : null;

          sendResponse({
            ok: true,
            data: {
              parsedResume: state.activeProfile?.parsedResume || null,
              parsedResumeAt: state.activeProfile?.parsedAt || null,
              uploadedResumeFile: state.activeProfile?.uploadedResumeFile || null,
              resumeProfiles: state.resumeProfiles,
              activeResumeProfileId: state.activeResumeProfileId,
              activeResumeProfile: state.activeProfile || null,
              lastScan: null,
              atsHistory: filterHistoryForActiveProfile(state.atsHistory, state.activeResumeProfileId),
              currentPageMatchResult
            }
          });
          break;
        }

        case "SUMMARIZE_ATS_HISTORY": {
          const state = await ensureResumeProfileStorage();
          const filteredHistory = filterHistoryForActiveProfile(state.atsHistory, state.activeResumeProfileId);
          const summary = summarizeAtsHistory(filteredHistory, state.activeProfile?.label || "current profile");

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

function createResumeProfileId() {
  return `resume_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildProfileLabel(profileLabel, fileName, parsedResume) {
  const trimmed = String(profileLabel || "").trim();
  if (trimmed) return trimmed;

  const fileStem = String(fileName || "resume.pdf").replace(/\.pdf$/i, "").trim();
  if (fileStem) return fileStem;

  const candidateName = String(parsedResume?.name || "").trim();
  if (candidateName) return `${candidateName} Resume`;

  return "Resume Profile";
}

function uniquifyProfileLabel(label, existingProfiles) {
  const used = new Set((existingProfiles || []).map((profile) => String(profile.label || "").toLowerCase()));
  if (!used.has(label.toLowerCase())) return label;

  let counter = 2;
  let candidate = `${label} (${counter})`;
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${label} (${counter})`;
  }
  return candidate;
}

function inferLegacyProfileLabel(parsedResume, uploadedResumeFile) {
  const candidateName = String(parsedResume?.name || "").trim();
  const fileName = String(uploadedResumeFile?.displayName || uploadedResumeFile?.name || "").replace(/\.pdf$/i, "").trim();
  if (fileName) return fileName;
  if (candidateName) return `${candidateName} Resume`;
  return "Imported Resume";
}

function filterHistoryForActiveProfile(history, activeResumeProfileId) {
  const all = Array.isArray(history) ? history : [];
  if (!activeResumeProfileId) return all;
  return all.filter((entry) => entry.profileId === activeResumeProfileId);
}

async function ensureResumeProfileStorage() {
  const data = await chrome.storage.local.get([
    "resumeProfiles",
    "activeResumeProfileId",
    "parsedResume",
    "parsedResumeAt",
    "uploadedResumeFile",
    "atsResultsByUrl",
    "atsResultsByProfileUrl",
    "atsHistory"
  ]);

  let resumeProfiles = Array.isArray(data.resumeProfiles) ? data.resumeProfiles.filter(Boolean) : [];
  let activeResumeProfileId = data.activeResumeProfileId || null;
  let atsResultsByProfileUrl = data.atsResultsByProfileUrl && typeof data.atsResultsByProfileUrl === "object"
    ? { ...data.atsResultsByProfileUrl }
    : {};
  let atsHistory = Array.isArray(data.atsHistory) ? [...data.atsHistory] : [];
  let changed = false;

  if (!resumeProfiles.length && data.parsedResume) {
    const legacyProfile = {
      id: createResumeProfileId(),
      label: inferLegacyProfileLabel(data.parsedResume, data.uploadedResumeFile),
      fileName: data.uploadedResumeFile?.displayName || data.uploadedResumeFile?.name || "resume.pdf",
      parsedAt: data.parsedResumeAt || new Date().toISOString(),
      uploadedResumeFile: data.uploadedResumeFile || null,
      parsedResume: data.parsedResume
    };

    resumeProfiles = [legacyProfile];
    activeResumeProfileId = legacyProfile.id;
    changed = true;

    if (data.atsResultsByUrl && typeof data.atsResultsByUrl === "object" && Object.keys(data.atsResultsByUrl).length) {
      atsResultsByProfileUrl[legacyProfile.id] = data.atsResultsByUrl;
    }

    atsHistory = atsHistory.map((entry) => ({
      ...entry,
      profileId: entry.profileId || legacyProfile.id,
      profileLabel: entry.profileLabel || legacyProfile.label
    }));
  }

  if (resumeProfiles.length && (!activeResumeProfileId || !resumeProfiles.some((profile) => profile.id === activeResumeProfileId))) {
    activeResumeProfileId = resumeProfiles[0].id;
    changed = true;
  }

  const activeProfile = resumeProfiles.find((profile) => profile.id === activeResumeProfileId) || null;

  if (changed) {
    await chrome.storage.local.set({
      resumeProfiles,
      activeResumeProfileId,
      parsedResume: activeProfile?.parsedResume || null,
      parsedResumeAt: activeProfile?.parsedAt || null,
      uploadedResumeFile: activeProfile?.uploadedResumeFile || null,
      atsResultsByProfileUrl,
      atsHistory
    });
  }

  return {
    resumeProfiles,
    activeResumeProfileId,
    activeProfile,
    atsResultsByProfileUrl,
    atsHistory
  };
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);

  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function summarizeAtsHistory(history, profileLabel = "current profile") {
  const total = history.length;

  if (!total) {
    return {
      totalRecords: 0,
      keywordStats: {},
      ruleStats: {},
      summaryText: `No ATS history yet for ${profileLabel}.`
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
    `Scanned ${total} job pages for ${profileLabel}.`,
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
