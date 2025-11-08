// Background service worker

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default storage keys
  chrome.storage.local.set({ notes: [] });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const payload = msg.payload || {};
    const tabId = sender.tab?.id;
    chrome.storage.local.set({ lastPanelPayload: payload }, () => {
      if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === "function") {
        if (tabId != null) {
          chrome.sidePanel.setOptions({ tabId, path: "panel.html", enabled: true }, () => {
            if (chrome.sidePanel && typeof (chrome.sidePanel as any).open === "function" && tabId != null) {
              // @ts-ignore: open may exist depending on Chrome version
              (chrome.sidePanel as any).open({ tabId });
            }
          });
        }
      }
    });
    sendResponse?.({ ok: true });
    return true;
  }
});
