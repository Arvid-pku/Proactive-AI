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
      // Can't call sidePanel.open() from message handler (not a user gesture)
      // So we enable the panel and use action.openPopup or just notify user
      if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === "function" && tabId != null) {
        chrome.sidePanel.setOptions({ tabId, path: "panel.html", enabled: true }, () => {
          if (chrome.runtime.lastError) {
            // Fallback to opening panel.html in a new tab
            chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
            return;
          }
          // Panel is now enabled. We can't programmatically open it from here,
          // but we can use chrome.action.openPopup() if available, or fallback to a tab
          // Since Chrome 114+ allows sidePanel, we'll just open it as a tab for reliability
          chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
        });
      } else {
        // Fallback: open as a new tab
        chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
      }
    });
    sendResponse?.({ ok: true });
    return true;
  }
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "proactive-open-panel" || info.menuItemId === "proactive-show-notes") {
      // Context menu click IS a user gesture, so we can try sidePanel.open
      const tabId = tab?.id ?? undefined;
      if (tabId != null && chrome.sidePanel?.setOptions) {
        chrome.sidePanel.setOptions({ tabId, path: "panel.html", enabled: true }, () => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
            return;
          }
          // Try to open side panel; context menu IS a user gesture
          if ((chrome.sidePanel as any)?.open && tabId != null) {
            try {
              // @ts-ignore
              (chrome.sidePanel as any).open({ tabId });
            } catch (err) {
              // If it still fails, fallback to tab
              chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
            }
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
