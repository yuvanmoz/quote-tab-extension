const CLOCK_ENABLED_KEY = "floating_clock_enabled";
const CLOCK_POS_KEY = "floating_clock_pos";
const CLOCK_THEME_KEY = "floating_clock_theme";
const CLOCK_TIMER_STATE_KEY = "floating_clock_timer_state";
const CLOCK_SOUND_ENABLED_KEY = "floating_clock_sound_enabled";
const CLOCK_SOUND_FILE_PATH = "asset/mixkit-magic-notification-ring-2344.wav";

function isValidClockTheme(value) {
  return value === "light" || value === "dark";
}

function getClockSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        [CLOCK_ENABLED_KEY]: false,
        [CLOCK_POS_KEY]: null,
        [CLOCK_THEME_KEY]: "dark",
        [CLOCK_TIMER_STATE_KEY]: null,
        [CLOCK_SOUND_ENABLED_KEY]: false,
      },
      (data) => resolve(data)
    );
  });
}

function setClockPosition(position) {
  chrome.storage.sync.set({ [CLOCK_POS_KEY]: position });
}

function formatLocalTime() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
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

function applyClockPos(element, pos) {
  const clamped = getClampedPos(pos.x, pos.y, element);
  element.style.left = `${clamped.x}px`;
  element.style.top = `${clamped.y}px`;
  return clamped;
}

function createClock() {
  const clock = document.createElement("div");
  clock.id = "nt-floating-clock";
  const fill = document.createElement("span");
  fill.className = "nt-clock-fill";
  const text = document.createElement("span");
  text.className = "nt-clock-text";
  text.textContent = formatLocalTime();
  clock.append(fill, text);
  return clock;
}

function sanitizeTimerState(raw) {
  const durationMs = Math.max(60 * 1000, Number(raw?.durationMs) || 25 * 60 * 1000);
  const elapsedMs = Math.min(Math.max(0, Number(raw?.elapsedMs) || 0), durationMs);
  const startedAt = typeof raw?.startedAt === "number" ? raw.startedAt : null;
  const isRunning = Boolean(raw?.isRunning && startedAt);
  return { durationMs, elapsedMs, startedAt, isRunning };
}

function getTimerProgress(timerState) {
  const state = sanitizeTimerState(timerState);
  if (!state.isRunning && state.elapsedMs <= 0) return 0;
  if (state.durationMs <= 0) return 0;
  const liveElapsed = state.isRunning
    ? state.elapsedMs + Math.max(0, Date.now() - state.startedAt)
    : state.elapsedMs;
  return Math.min(1, Math.max(0, liveElapsed / state.durationMs));
}

function applyClockFill(clock, timerState) {
  const fill = clock.querySelector(".nt-clock-fill");
  if (!fill) return;
  const progress = getTimerProgress(timerState);
  fill.style.transform = `scaleX(${progress})`;
  fill.style.opacity = progress > 0 ? "1" : "0";
}

function applyClockTheme(element, theme) {
  const resolvedTheme = isValidClockTheme(theme) ? theme : "dark";
  element.classList.remove("clock-theme-dark", "clock-theme-light");
  element.classList.add(`clock-theme-${resolvedTheme}`);
}

let clockAlertAudio = null;

function getClockAlertAudio() {
  if (clockAlertAudio) return clockAlertAudio;
  const audio = new Audio(chrome.runtime.getURL(CLOCK_SOUND_FILE_PATH));
  audio.preload = "auto";
  audio.volume = 0.9;
  clockAlertAudio = audio;
  return clockAlertAudio;
}

function playClockAlertSound() {
  try {
    const audio = getClockAlertAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (err) {
    // no-op: some pages may block audio until user gesture
  }
}

function shouldPlayFiveMinuteAlert(now) {
  return now.getSeconds() === 50 && ((now.getMinutes() + 1) % 5 === 0);
}

async function initFloatingClock() {
  if (window !== window.top) return;

  const settings = await getClockSettings();
  if (!settings[CLOCK_ENABLED_KEY]) return;
  let timerState = sanitizeTimerState(settings[CLOCK_TIMER_STATE_KEY]);
  let soundEnabled = Boolean(settings[CLOCK_SOUND_ENABLED_KEY]);
  let lastAlertKey = "";

  const clock = createClock();
  const text = clock.querySelector(".nt-clock-text");
  applyClockTheme(clock, settings[CLOCK_THEME_KEY]);
  document.body.appendChild(clock);
  applyClockFill(clock, timerState);

  const rect = clock.getBoundingClientRect();
  const defaultPos = {
    x: Math.max(12, window.innerWidth - rect.width - 24),
    y: 24,
  };
  const startPos = settings[CLOCK_POS_KEY] && typeof settings[CLOCK_POS_KEY].x === "number"
    ? settings[CLOCK_POS_KEY]
    : defaultPos;
  applyClockPos(clock, startPos);

  const timeTimer = setInterval(() => {
    const now = new Date();
    if (text) {
      text.textContent = now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }
    if (soundEnabled && shouldPlayFiveMinuteAlert(now)) {
      const alertKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      if (lastAlertKey !== alertKey) {
        lastAlertKey = alertKey;
        playClockAlertSound();
      }
    }
  }, 1000);
  const fillTimer = setInterval(() => {
    applyClockFill(clock, timerState);
  }, 200);

  let dragState = null;

  function teardown() {
    clearInterval(timeTimer);
    clearInterval(fillTimer);
    window.removeEventListener("resize", onResize);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    if (clock.parentNode) clock.parentNode.removeChild(clock);
  }

  function onResize() {
    const left = parseFloat(clock.style.left || "24");
    const top = parseFloat(clock.style.top || "24");
    const next = applyClockPos(clock, { x: left, y: top });
    setClockPosition(next);
  }

  function onStorageChanged(changes, area) {
    if (area !== "sync") return;

    if (changes[CLOCK_ENABLED_KEY]) {
      if (!changes[CLOCK_ENABLED_KEY].newValue) {
        teardown();
      }
    }

    if (changes[CLOCK_POS_KEY] && changes[CLOCK_POS_KEY].newValue && clock.parentNode) {
      applyClockPos(clock, changes[CLOCK_POS_KEY].newValue);
    }

    if (changes[CLOCK_THEME_KEY] && clock.parentNode) {
      applyClockTheme(clock, changes[CLOCK_THEME_KEY].newValue);
    }

    if (changes[CLOCK_TIMER_STATE_KEY] && clock.parentNode) {
      timerState = sanitizeTimerState(changes[CLOCK_TIMER_STATE_KEY].newValue);
      applyClockFill(clock, timerState);
    }

    if (changes[CLOCK_SOUND_ENABLED_KEY] && clock.parentNode) {
      soundEnabled = Boolean(changes[CLOCK_SOUND_ENABLED_KEY].newValue);
      if (!soundEnabled) {
        lastAlertKey = "";
      }
    }
  }

  function onPointerMove(event) {
    if (!dragState) return;
    const x = event.clientX - dragState.offsetX;
    const y = event.clientY - dragState.offsetY;
    applyClockPos(clock, { x, y });
  }

  function onPointerUp() {
    if (!dragState) return;
    clock.classList.remove("nt-dragging");
    const left = parseFloat(clock.style.left || "24");
    const top = parseFloat(clock.style.top || "24");
    const next = applyClockPos(clock, { x: left, y: top });
    setClockPosition(next);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    dragState = null;
  }

  clock.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rectNow = clock.getBoundingClientRect();
    dragState = {
      offsetX: event.clientX - rectNow.left,
      offsetY: event.clientY - rectNow.top,
    };
    clock.classList.add("nt-dragging");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  window.addEventListener("resize", onResize);
  chrome.storage.onChanged.addListener(onStorageChanged);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFloatingClock);
} else {
  initFloatingClock();
}
