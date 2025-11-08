// Background service worker

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default storage keys
  chrome.storage.local.set({ notes: [] });

  // Create context menu to open the panel explicitly
  if (chrome.contextMenus) {
    try {
      chrome.contextMenus.create({ id: "proactive-open-panel", title: "Open Proactive-AI Panel", contexts: ["all"] });
      chrome.contextMenus.create({ id: "proactive-show-notes", title: "Show Notes", contexts: ["all"] });
    } catch (_) {
      // no-op (duplicated on update)
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const payload = msg.payload || {};
    const tabId = sender.tab?.id;
    chrome.storage.local.set({ lastPanelPayload: payload }, () => {
      const openSidePanel = () => {
        if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === "function" && tabId != null) {
          chrome.sidePanel.setOptions({ tabId, path: "panel.html", enabled: true }, () => {
            if (chrome.runtime.lastError) {
              // Fallback to opening panel.html in a tab
              chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
              return;
            }
            if ((chrome.sidePanel as any)?.open && tabId != null) {
              // @ts-ignore open may exist depending on Chrome version
              (chrome.sidePanel as any).open({ tabId });
            } else {
              // Fallback: open as a new tab
              chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
            }
          });
        } else {
          // Fallback: open as a new tab
          chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
        }
      };
      openSidePanel();
    });
    sendResponse?.({ ok: true });
    return true;
  }
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "proactive-open-panel" || info.menuItemId === "proactive-show-notes") {
      const tabId = tab?.id ?? undefined;
      if (tabId != null && chrome.sidePanel?.setOptions) {
        chrome.sidePanel.setOptions({ tabId, path: "panel.html", enabled: true }, () => {
          if ((chrome.sidePanel as any)?.open && tabId != null) {
            // @ts-ignore
            (chrome.sidePanel as any).open({ tabId });
          } else {
            chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
          }
        });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
      }
    }
  });
}
