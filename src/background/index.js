import { getToolSuggestions } from './suggestions.js';
import { executeTool } from './toolHandlers.js';
import { resetClient } from './openaiClient.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TOOL_SUGGESTIONS') {
    handleToolSuggestions(request.data).then(sendResponse);
    return true;
  }

  if (request.action === 'OPEN_SIDE_PANEL') {
    openSidePanel(sender, sendResponse);
    return true;
  }

  if (request.action === 'EXECUTE_TOOL') {
    handleToolExecution(request.data).then(sendResponse);
    return true;
  }

  if (request.action === 'SET_API_KEY') {
    chrome.storage.local
      .set({ apiKey: request.apiKey })
      .then(() => {
        resetClient();
        console.log('API key updated successfully');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Error saving API key:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  return false;
});

async function handleToolSuggestions(data) {
  const payload = {
    ...data,
    metadata: data.metadata || {}
  };

  return getToolSuggestions(payload);
}

async function handleToolExecution(data = {}) {
  return executeTool({
    toolId: data.toolId,
    content: data.content,
    context: data.context,
    metadata: data.metadata,
    contentTypes: data.contentTypes
  });
}

function openSidePanel(sender, sendResponse) {
  (async () => {
    try {
      const windowId = sender?.tab?.windowId ?? (await chrome.windows.getLastFocused()).id;
      try {
        await chrome.sidePanel.open({ windowId });
        console.log('Side panel opened successfully');
      } catch (error) {
        console.error('Error opening side panel:', error);
        sendResponse({ success: false, error: error.message });
        return;
      }

      const senderTab = sender?.tab;
      if (senderTab?.id) {
        await chrome.sidePanel
          .setOptions({
            tabId: senderTab.id,
            path: 'sidepanel.html',
            enabled: true
          })
          .catch(() => {});
      }

      sendResponse({ success: true });
    } catch (error) {
      console.error('Unexpected error while opening side panel:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
}

chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked, opening side panel...');
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log('Side panel opened from extension icon');
  } catch (error) {
    console.error('Error opening side panel from icon:', error);
  }
});

try {
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
} catch (e) {
  // Ignore if not supported
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch (e) {
    // Ignore if not supported
  }
});

console.log('Proactive AI Assistant background service worker loaded');
