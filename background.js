chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !sender || !sender.tab) return;

  if (message.type === "get_tabs") {
    chrome.tabs.query({ windowId: sender.tab.windowId }, (tabs) => {
      const payload = (tabs || []).map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.active,
      }));
      sendResponse({ tabs: payload });
    });
    return true;
  }

  if (message.type === "activate_tab") {
    chrome.tabs.update(message.tabId, { active: true });
  }

  if (message.type === "toggle_fullscreen") {
    chrome.windows.get(sender.tab.windowId, (win) => {
      if (!win) return;
      const next = win.state === "fullscreen" ? "normal" : "fullscreen";
      chrome.windows.update(win.id, { state: next });
    });
  }

  if (message.type === "get_window_state") {
    chrome.windows.get(sender.tab.windowId, (win) => {
      sendResponse({ state: win ? win.state : "normal" });
    });
    return true;
  }
});
