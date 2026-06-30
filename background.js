chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !sender || !sender.tab) return;

  if (message.type === "get_tabs") {
    chrome.tabs.query({ windowId: sender.tab.windowId }, (tabs) => {
      const payload = (tabs || []).map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
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

// Alarm Audio Playback logic
let creatingOffscreenPromise = null;

async function setupOffscreenDocument(path) {
  if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
  } else {
    creatingOffscreenPromise = chrome.offscreen.createDocument({
      url: path,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'play 5-minute bell alert'
    });
    await creatingOffscreenPromise;
    creatingOffscreenPromise = null;
  }
}

async function playSound(file, volume = 0.9) {
  await setupOffscreenDocument('offscreen.html');
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'play_sound',
    file: chrome.runtime.getURL(file),
    volume
  });
}

function getNextAlertTime() {
  const now = Date.now();
  const date = new Date(now);
  const currentMinutes = date.getMinutes();
  const currentSeconds = date.getSeconds();
  
  let targetMinutes = currentMinutes;
  const nextFiveMultiple = Math.floor(currentMinutes / 5) * 5 + 5;
  const targetMinuteInFiveBlock = nextFiveMultiple - 1;
  
  if (currentMinutes < targetMinuteInFiveBlock || (currentMinutes === targetMinuteInFiveBlock && currentSeconds < 50)) {
    targetMinutes = targetMinuteInFiveBlock;
  } else {
    targetMinutes = targetMinuteInFiveBlock + 5;
  }
  
  const targetDate = new Date(date);
  targetDate.setMinutes(targetMinutes, 50, 0);
  return targetDate.getTime();
}

function setupFiveMinuteAlarm() {
  const nextAlertTime = getNextAlertTime();
  chrome.alarms.create("five_minute_alert", {
    when: nextAlertTime,
    periodInMinutes: 5
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "five_minute_alert") {
    chrome.storage.sync.get(["floating_clock_sound_enabled"], (data) => {
      if (data.floating_clock_sound_enabled) {
        playSound("asset/bell.mp3");
      }
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setupFiveMinuteAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  setupFiveMinuteAlarm();
});
