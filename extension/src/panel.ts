function $(id: string) {
  return document.getElementById(id)!;
}

const lastTextEl = $("last-text");
const notesList = $("notes");

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
  $("btn-explain").addEventListener("click", () => notify("Explain action coming soon"));
  $("btn-translate").addEventListener("click", () => notify("Translate action coming soon"));
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
  attachActions();

  chrome.storage.local.get({ lastPanelPayload: null, notes: [] }, (d) => {
    const payload = d.lastPanelPayload || {};
    setLastText(String(payload.text || ""));
    renderNotes(Array.isArray(d.notes) ? d.notes : []);
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
