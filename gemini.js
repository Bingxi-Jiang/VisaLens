const DEFAULT_MODEL = "gemini-3-flash-preview";

function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["geminiApiKey"], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const key = result.geminiApiKey;
      if (!key) {
        reject(new Error("Missing Gemini API key. Please set it in the extension popup first."));
        return;
      }
      resolve(key);
    });
  });
}

export async function uploadPdfToGemini(file) {
  const apiKey = await getApiKey();

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(file.size),
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: {
          display_name: file.name
        }
      })
    }
  );

  if (!startRes.ok) {
    throw new Error(`Failed to start Gemini file upload: ${await startRes.text()}`);
  }

  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("Gemini upload URL missing.");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: file
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload PDF: ${await uploadRes.text()}`);
  }

  const uploaded = await uploadRes.json();
  if (!uploaded.file) {
    throw new Error("Gemini file upload returned no file object.");
  }

  return uploaded.file;
}

export async function generateWithPdf(fileUri, mimeType, promptText, model = DEFAULT_MODEL) {
  const apiKey = await getApiKey();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                file_data: {
                  file_uri: fileUri,
                  mime_type: mimeType || "application/pdf"
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini PDF request failed: ${await res.text()}`);
  }

  return await res.json();
}

export async function generateFromText(promptText, model = DEFAULT_MODEL) {
  const apiKey = await getApiKey();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini text request failed: ${await res.text()}`);
  }

  return await res.json();
}

export function extractJsonText(responseJson) {
  const text = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no text content.");
  }
  return text;
}