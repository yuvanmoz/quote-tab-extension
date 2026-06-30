const PANEL_POS_KEY = "trading_panel_pos";
const THEME_KEY = "trading_panel_theme";

// Modular configuration for panel buttons
const BUTTONS_CONFIG = [
  {
    id: "buy",
    label: "Buy",
    emoji: "🟢",
    colorClass: "nt-btn-buy",
    shortcut: { key: "B", code: "KeyB", keyCode: 66 }
  },
  {
    id: "sell",
    label: "Sell",
    emoji: "🔴",
    colorClass: "nt-btn-sell",
    shortcut: { key: "S", code: "KeyS", keyCode: 83 }
  },
  {
    id: "exit",
    label: "Exit",
    emoji: "⚫",
    colorClass: "nt-btn-exit",
    shortcut: { key: "X", code: "KeyX", keyCode: 88 }
  }
];

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        [PANEL_POS_KEY]: null,
        [THEME_KEY]: "dark",
      },
      (data) => resolve(data)
    );
  });
}

function savePanelPosition(position) {
  chrome.storage.sync.set({ [PANEL_POS_KEY]: position });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getClampedPos(x, y, element) {
  const rect = element.getBoundingClientRect();
  const maxX = Math.max(8, window.innerWidth - rect.width - 8);
  const maxY = Math.max(8, window.innerHeight - rect.height - 8);
  return {
    x: clamp(x, 8, maxX),
    y: clamp(y, 8, maxY),
  };
}

function applyPanelPos(element, pos) {
  const clamped = getClampedPos(pos.x, pos.y, element);
  element.style.left = `${clamped.x}px`;
  element.style.top = `${clamped.y}px`;
  return clamped;
}

// Dispatches synthetic keyboard shortcut events (Shift + key)
function triggerShortcut(key, code, keyCode) {
  const target = document.activeElement || document.body || document;
  
  // 1. Dispatch Shift keydown to simulate hold state
  const shiftDown = new KeyboardEvent("keydown", {
    key: "Shift",
    code: "ShiftLeft",
    keyCode: 16,
    which: 16,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    view: window
  });
  target.dispatchEvent(shiftDown);

  // 2. Dispatch character keydown with Shift active
  const keydown = new KeyboardEvent("keydown", {
    key: key,
    code: code,
    keyCode: keyCode,
    which: keyCode,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    view: window
  });
  target.dispatchEvent(keydown);

  // 3. Dispatch character keyup with Shift active
  const keyup = new KeyboardEvent("keyup", {
    key: key,
    code: code,
    keyCode: keyCode,
    which: keyCode,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    view: window
  });
  target.dispatchEvent(keyup);

  // 4. Dispatch Shift keyup to release hold state
  const shiftUp = new KeyboardEvent("keyup", {
    key: "Shift",
    code: "ShiftLeft",
    keyCode: 16,
    which: 16,
    shiftKey: false,
    bubbles: true,
    cancelable: true,
    view: window
  });
  target.dispatchEvent(shiftUp);
}

function createTradingPanel(theme) {
  const panel = document.createElement("div");
  panel.id = "nt-trading-panel";
  panel.className = `theme-${theme}`;

  // 1. Drag Handle
  const handle = document.createElement("div");
  handle.className = "nt-drag-handle";
  handle.title = "Drag to reposition panel";
  const handleDot = document.createElement("span");
  handleDot.className = "nt-drag-handle-dot";
  handle.appendChild(handleDot);
  panel.appendChild(handle);

  // 2. Buttons
  BUTTONS_CONFIG.forEach((btnConfig) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nt-btn ${btnConfig.colorClass}`;
    button.title = `Trigger Shift + ${btnConfig.shortcut.key}`;
    
    const emojiSpan = document.createElement("span");
    emojiSpan.className = "nt-btn-emoji";
    emojiSpan.textContent = btnConfig.emoji;
    emojiSpan.style.marginRight = "6px";
    
    const textSpan = document.createElement("span");
    textSpan.textContent = btnConfig.label;
    
    button.appendChild(emojiSpan);
    button.appendChild(textSpan);

    // Prevent default pointerdown to prevent focus from shifting away from chart
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });

    // Handle click to trigger shortcut
    button.addEventListener("click", () => {
      triggerShortcut(btnConfig.shortcut.key, btnConfig.shortcut.code, btnConfig.shortcut.keyCode);
    });

    panel.appendChild(button);
  });

  return panel;
}

async function initTradingPanel() {
  if (window !== window.top) return;

  const settings = await getSettings();
  
  // Theme selection: read extension theme, but adapt if page has light mode indicator
  let resolvedTheme = settings[THEME_KEY] || "dark";
  if (document.body && (document.body.classList.contains("theme-light") || document.body.getAttribute("data-theme") === "light")) {
    resolvedTheme = "light";
  }

  const panel = createTradingPanel(resolvedTheme);
  document.body.appendChild(panel);

  // Set default / saved position
  const rect = panel.getBoundingClientRect();
  const defaultPos = {
    x: 24,
    y: 80, // Underneath potential header elements or clock
  };
  const startPos = settings[PANEL_POS_KEY] && typeof settings[PANEL_POS_KEY].x === "number"
    ? settings[PANEL_POS_KEY]
    : defaultPos;
  
  applyPanelPos(panel, startPos);

  // Drag-and-drop state
  let dragState = null;

  function onPointerMove(event) {
    if (!dragState) return;
    const x = event.clientX - dragState.offsetX;
    const y = event.clientY - dragState.offsetY;
    applyPanelPos(panel, { x, y });
  }

  function onPointerUp() {
    if (!dragState) return;
    panel.classList.remove("nt-dragging");
    const left = parseFloat(panel.style.left || "24");
    const top = parseFloat(panel.style.top || "80");
    const next = applyPanelPos(panel, { x: left, y: top });
    savePanelPosition(next);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    dragState = null;
  }

  panel.addEventListener("pointerdown", (event) => {
    // Only drag with left click and when not clicking buttons
    if (event.button !== 0) return;
    if (event.target.closest(".nt-btn")) return;

    const rectNow = panel.getBoundingClientRect();
    dragState = {
      offsetX: event.clientX - rectNow.left,
      offsetY: event.clientY - rectNow.top,
    };
    panel.classList.add("nt-dragging");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  function onResize() {
    const left = parseFloat(panel.style.left || "24");
    const top = parseFloat(panel.style.top || "80");
    const next = applyPanelPos(panel, { x: left, y: top });
    savePanelPosition(next);
  }

  window.addEventListener("resize", onResize);

  // Listen for storage changes to sync position or theme
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes[PANEL_POS_KEY] && changes[PANEL_POS_KEY].newValue) {
      applyPanelPos(panel, changes[PANEL_POS_KEY].newValue);
    }

    if (changes[THEME_KEY] && changes[THEME_KEY].newValue) {
      panel.className = `theme-${changes[THEME_KEY].newValue}`;
    }
  });
}

// Initialize when ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTradingPanel);
} else {
  initTradingPanel();
}
