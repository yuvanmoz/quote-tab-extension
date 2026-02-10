const WHITELIST_KEY = "whitelist";
const SHOW_THRESHOLD = 10;
const REFRESH_INTERVAL_MS = 900;

function normalizeDomain(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  let host = trimmed;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch (err) {
      host = trimmed.replace(/^https?:\/\//, "");
    }
  }
  host = host.split("/")[0];
  host = host.split("?")[0].split("#")[0];
  host = host.replace(/:\d+$/, "");
  return host.replace(/^www\./, "").replace(/^m\./, "");
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

function matchesWhitelist(hostname, whitelist) {
  const host = normalizeHost(hostname);
  return whitelist.some((domain) => {
    if (!domain) return false;
    if (host === domain) return true;
    return host.endsWith(`.${domain}`);
  });
}

function getWhitelist() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [WHITELIST_KEY]: [] }, (data) => {
      const list = Array.isArray(data[WHITELIST_KEY]) ? data[WHITELIST_KEY] : [];
      resolve(list.map(normalizeDomain).filter(Boolean));
    });
  });
}

function createOverlay() {
  const hoverZone = document.createElement("div");
  hoverZone.id = "nt-hover-zone";

  const panel = document.createElement("div");
  panel.id = "nt-tab-panel";

  const list = document.createElement("div");
  list.id = "nt-tab-list";
  panel.appendChild(list);

  document.body.appendChild(hoverZone);
  document.body.appendChild(panel);

  return { hoverZone, panel, list };
}

let hideTimer = null;
let currentTabs = [];
let isFullscreenState = false;
let lastRefresh = 0;

function sendMessagePromise(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      resolve(null);
    }
  });
}

function showPanel(panel) {
  panel.classList.add("visible");
}

function hidePanel(panel) {
  panel.classList.remove("visible");
}

function scheduleHide(panel, delay = 1500) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hidePanel(panel), delay);
}

function renderTabs(list, tabs) {
  list.innerHTML = "";
  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nt-tab-item";
    btn.textContent = tab.title || tab.url || "(untitled)";
    if (tab.active) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "activate_tab", tabId: tab.id });
    });
    list.appendChild(btn);
  });
}

async function refreshTabs(list) {
  const response = await sendMessagePromise({ type: "get_tabs" });
  if (response && Array.isArray(response.tabs)) {
    currentTabs = response.tabs;
    renderTabs(list, currentTabs);
  }
}

async function updateFullscreenState() {
  const response = await sendMessagePromise({ type: "get_window_state" });
  isFullscreenState = response && response.state === "fullscreen";
  return isFullscreenState;
}

async function initOverlay() {
  const whitelist = await getWhitelist();
  const hostname = normalizeHost(window.location.hostname);
  if (!matchesWhitelist(hostname, whitelist)) return;
  const { hoverZone, panel, list } = createOverlay();

  // Track if mouse is in the hover zone or panel
  let mouseInHoverZone = false;

  hoverZone.addEventListener("mouseenter", async () => {
    mouseInHoverZone = true;
    const isFullscreen = await updateFullscreenState();
    if (!isFullscreen) {
      hidePanel(panel);
      return;
    }
    const now = Date.now();
    if (now - lastRefresh > REFRESH_INTERVAL_MS) {
      lastRefresh = now;
      await refreshTabs(list);
    }
    showPanel(panel);
  });

  hoverZone.addEventListener("mouseleave", () => {
    mouseInHoverZone = false;
    scheduleHide(panel, 500);
  });

  panel.addEventListener("mouseenter", () => {
    clearTimeout(hideTimer);
  });

  panel.addEventListener("mouseleave", () => {
    if (!mouseInHoverZone) {
      scheduleHide(panel, 800);
    }
  });

  document.addEventListener("mousemove", async (event) => {
    // Only trigger if in the top 10px area
    if (event.clientY > SHOW_THRESHOLD) return;
    
    const isFullscreen = await updateFullscreenState();
    if (!isFullscreen) {
      hidePanel(panel);
      return;
    }
    
    const now = Date.now();
    if (now - lastRefresh > REFRESH_INTERVAL_MS) {
      lastRefresh = now;
      await refreshTabs(list);
    }
    
    // Clear existing hide timer and show panel
    clearTimeout(hideTimer);
    showPanel(panel);
  });

  setInterval(async () => {
    const isFullscreen = await updateFullscreenState();
    if (!isFullscreen) {
      hidePanel(panel);
    }
  }, 1000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[WHITELIST_KEY]) return;
    const next = (changes[WHITELIST_KEY].newValue || []).map(normalizeDomain).filter(Boolean);
    if (!matchesWhitelist(hostname, next)) {
      hoverZone.remove();
      panel.remove();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOverlay);
} else {
  initOverlay();
}
