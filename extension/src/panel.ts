function $(id: string) {
  return document.getElementById(id)!;
}

const lastTextEl = $("last-text");
const notesList = $("notes");
const aiResultEl = $("ai-result");

function renderNotes(items: Array<{ text: string; url: string; ts: number }>) {
  notesList.innerHTML = "";
  items.slice(0, 20).forEach((n) => {
    const li = document.createElement("li");
    const date = new Date(n.ts).toLocaleString();
    li.innerHTML = `<div>${escapeHtml(n.text)}</div><div style="color:#9ca3af">${date} · <a href="${n.url}" target="_blank" style="color:#93c5fd;">open</a></div>`;
    notesList.appendChild(li);
  });
}

function escapeHtml(s: string) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function setLastText(value: string) {
  lastTextEl.textContent = value || "—";
}

function attachActions() {
  $("btn-graph").addEventListener("click", () => notify("Graph action coming soon"));
  $("btn-explain").addEventListener("click", onExplainClick);
  $("btn-translate").addEventListener("click", onTranslateClick);
  $("btn-save-key").addEventListener("click", onSaveKey);
  $("btn-clear-notes").addEventListener("click", onClearNotes);
}

function notify(msg: string) {
  // Simple inline notification in the header area
  const bannerId = "banner";
  let banner = document.getElementById(bannerId) as HTMLDivElement | null;
  if (!banner) {
    banner = document.createElement("div");
    banner.id = bannerId;
    banner.style.cssText = "margin-bottom:8px;color:#93c5fd;font-size:12px";
    document.body.insertBefore(banner, document.body.firstChild);
  }
  banner.textContent = msg;
  setTimeout(() => {
    if (banner) banner.textContent = "";
  }, 1200);
}

function init() {
  // Ensure chrome API is available
  if (typeof chrome === "undefined" || !chrome?.storage) {
    console.error("Chrome API not available in panel context");
    notify("Extension API not available. Try reloading the extension.");
    return;
  }

  attachActions();

  chrome.storage.local.get({ lastPanelPayload: null, notes: [] }, (d) => {
    const payload = d.lastPanelPayload || {};
    setLastText(String(payload.text || ""));
    renderNotes(Array.isArray(d.notes) ? d.notes : []);
  });

  // Pre-fill key field if stored
  chrome.storage.local.get({ openaiKey: "" }, (d) => {
    const keyInput = $("openai-key") as HTMLInputElement;
    keyInput.value = String(d.openaiKey || "");
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.lastPanelPayload) {
      const val = changes.lastPanelPayload.newValue || {};
      setLastText(String(val?.text || ""));
    }
    if (changes.notes) {
      const notes = changes.notes.newValue || [];
      renderNotes(notes);
    }
  });
}

init();

async function onSaveKey() {
  if (!chrome?.storage) {
    notify("Chrome storage not available");
    return;
  }
  const keyInput = $("openai-key") as HTMLInputElement;
  const key = (keyInput.value || "").trim();
  await chrome.storage.local.set({ openaiKey: key });
  notify(key ? "API key saved" : "API key cleared");
}

async function onClearNotes() {
  if (!chrome?.storage) {
    notify("Chrome storage not available");
    return;
  }
  await chrome.storage.local.set({ notes: [] });
  notify("Notes cleared");
}

async function ensureKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage) {
      reject(new Error("Chrome storage not available"));
      return;
    }
    chrome.storage.local.get({ openaiKey: "" }, (d) => {
      const k = String(d.openaiKey || "");
      if (!k) {
        notify("Set OpenAI key in Settings");
        reject(new Error("Missing OpenAI key"));
      } else {
        resolve(k);
      }
    });
  });
}

async function onTranslateClick() {
  const text = String(lastTextEl.textContent || "");
  if (!text || text === "—") {
    notify("No selection");
    return;
  }
  const target = (document.getElementById("translate-target") as HTMLSelectElement).value || "en";
  try {
    aiResultEl.textContent = "Translating...";
    const key = await ensureKey();
    const result = await callOpenAI({
      key,
      system: `You translate text. Detect source language and translate to ${target}. Reply with translation only.`,
      user: text,
      temperature: 0.2,
    });
    aiResultEl.textContent = result || "(empty)";
  } catch (e: any) {
    aiResultEl.textContent = `Error: ${e?.message || e}`;
  }
}

async function onExplainClick() {
  const text = String(lastTextEl.textContent || "");
  if (!text || text === "—") {
    notify("No selection");
    return;
  }
  try {
    aiResultEl.textContent = "Explaining...";
    const key = await ensureKey();
    const result = await callOpenAI({
      key,
      system: `You are a concise explainer. If code, explain step by step with key ideas. If math, explain concepts and steps. Keep it under 10 bullet points.`,
      user: text,
      temperature: 0.2,
    });
    aiResultEl.textContent = result || "(empty)";
  } catch (e: any) {
    aiResultEl.textContent = `Error: ${e?.message || e}`;
  }
}

async function callOpenAI(params: { key: string; system: string; user: string; temperature?: number }): Promise<string> {
  const { key, system, user, temperature = 0 } = params;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return String(content || "").trim();
}
