// Content script: injects overlay and provides quick actions based on selection

type SuggestedAction = {
  id: string;
  label: string;
};

const root = document.createElement("div");
const shadow = root.attachShadow({ mode: "open" });
document.documentElement.appendChild(root);

const overlay = document.createElement("div");
overlay.id = "proactive-overlay";
overlay.style.cssText = [
  "position: fixed",
  "z-index: 2147483647",
  "display: none",
  "background: #111827",
  "color: white",
  "border-radius: 8px",
  "padding: 6px",
  "box-shadow: 0 8px 24px rgba(0,0,0,0.25)",
  "font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, sans-serif",
  "font-size: 12px",
].join("; ");
shadow.appendChild(overlay);

function getSelectionText(): string {
  const sel = window.getSelection();
  return sel && sel.rangeCount ? sel.toString().trim() : "";
}

function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  try {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return rect;
  } catch {
    return null;
  }
}

function heuristics(text: string) {
  const isMath = /[=^_\\]|\\frac|\\sum|\\int|sqrt|\d+\s*[+\-*\/^]\s*\d+/.test(text);
  const isCodePy = /\b(def|import|print|class)\b/.test(text);
  return { isMath, isCodePy };
}

function buildActions(text: string): SuggestedAction[] {
  const h = heuristics(text);
  const actions: SuggestedAction[] = [];
  if (h.isMath) {
    actions.push({ id: "math.graph", label: "Graph" });
    actions.push({ id: "math.copy_tex", label: "Copy TeX" });
  }
  if (h.isCodePy) {
    actions.push({ id: "code.run_py", label: "Run Python" });
    actions.push({ id: "code.explain", label: "Explain" });
  }
  if (!h.isMath && !h.isCodePy) {
    actions.push({ id: "text.translate", label: "Translate" });
    actions.push({ id: "text.save", label: "Save" });
    actions.push({ id: "dom.edit_toggle", label: "Edit DOM" });
  }
  return actions;
}

function positionOverlay(rect: DOMRect) {
  const maxWidth = 300;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - maxWidth - 8);
  const top = Math.min(rect.bottom + 8, window.innerHeight - 48);
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function setButtons(actions: SuggestedAction[]) {
  overlay.innerHTML = "";
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.gap = "6px";
  actions.forEach((a) => {
    const btn = document.createElement("button");
    btn.textContent = a.label;
    btn.dataset.action = a.id;
    btn.style.cssText = [
      "background:#2563eb",
      "color:white",
      "border:none",
      "border-radius:6px",
      "padding:6px 10px",
      "cursor:pointer",
    ].join("; ");
    btn.addEventListener("click", onActionClick);
    container.appendChild(btn);
  });
  overlay.appendChild(container);
}

async function onActionClick(e: Event) {
  const selText = getSelectionText();
  const target = e.currentTarget as HTMLButtonElement | null;
  if (!target) return;
  const actionId = target.dataset.action || "";

  switch (actionId) {
    case "math.copy_tex": {
      try {
        await navigator.clipboard.writeText(selText);
        toast("Copied as TeX");
      } catch {
        toast("Copy failed");
      }
      break;
    }
    case "text.save": {
      if (chrome?.storage?.local) {
        const item = { text: selText, url: location.href, ts: Date.now() };
        chrome.storage.local.get({ notes: [] }, (d) => {
          const notes = Array.isArray(d.notes) ? d.notes : [];
          notes.unshift(item);
          chrome.storage.local.set({ notes });
          toast("Saved to notes (see side panel)");
        });
      } else {
        toast("Storage API not available");
      }
      break;
    }
    case "dom.edit_toggle": {
      const editable = document.body.getAttribute("contenteditable") === "true";
      document.body.setAttribute("contenteditable", (!editable).toString());
      toast(!editable ? "Edit mode ON" : "Edit mode OFF");
      break;
    }
    case "math.graph":
    case "code.run_py":
    case "code.explain":
    case "text.translate": {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: "OPEN_SIDE_PANEL",
          payload: { text: selText, actionId }
        });
        toast("Opening panel in new tab...");
      } else {
        toast("Extension API not available");
      }
      break;
    }
    default:
      break;
  }
}

let hideTimer: number | null = null;
function toast(msg: string) {
  let t = overlay.querySelector(".toast") as HTMLDivElement | null;
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.style.cssText = [
      "margin-top:6px",
      "background:#374151",
      "padding:4px 8px",
      "border-radius:4px",
      "font-size:11px",
    ].join("; ");
    overlay.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = "block";
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (t) t.style.display = "none";
  }, 1200);
}

document.addEventListener("selectionchange", () => {
  const text = getSelectionText();
  if (!text) {
    overlay.style.display = "none";
    return;
  }
  const rect = getSelectionRect();
  if (!rect) return;
  positionOverlay(rect);
  const actions = buildActions(text);
  setButtons(actions);
  overlay.style.display = "block";
});
