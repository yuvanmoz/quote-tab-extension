const QUOTES_KEY = "quotes";
const THEME_KEY = "theme";
const SITES_KEY = "sites";
const NOTE_KEY = "quick_note";
const TYPE_SPEED_MS = 45;
const DELETE_SPEED_MS = 28;
const HOLD_AFTER_TYPE_MS = 1600;
const HOLD_AFTER_DELETE_MS = 320;
const NOTE_SAVE_DEBOUNCE_MS = 250;
const BREATH_IN_MS = 4000;
const BREATH_OUT_MS = 4000;
let editIndex = null;
let dndReady = false;
let escHandler = null;
let typewriterTimer = null;
let typewriterRunId = 0;
let noteSaveTimer = null;
let meditationTickTimer = null;
let meditationPhaseTimer = null;
let meditationEndAt = 0;
let meditationRunning = false;
let meditationPhase = "exhale";

function clearTypewriter() {
  if (typewriterTimer) {
    clearTimeout(typewriterTimer);
    typewriterTimer = null;
  }
  typewriterRunId += 1;
}

function startTypewriterLoop(text) {
  const quoteText = document.getElementById("quoteText");
  if (!quoteText) return;

  clearTypewriter();
  const fullText = (text || "").toString();
  if (!fullText) {
    quoteText.textContent = "";
    return;
  }

  const runId = typewriterRunId;
  let index = 0;
  let deleting = false;
  quoteText.textContent = "";

  const step = () => {
    if (runId !== typewriterRunId) return;

    if (!deleting) {
      index += 1;
      quoteText.textContent = fullText.slice(0, index);
      if (index < fullText.length) {
        typewriterTimer = setTimeout(step, TYPE_SPEED_MS);
      } else {
        typewriterTimer = setTimeout(() => {
          deleting = true;
          step();
        }, HOLD_AFTER_TYPE_MS);
      }
      return;
    }

    index -= 1;
    quoteText.textContent = fullText.slice(0, Math.max(0, index));
    if (index > 0) {
      typewriterTimer = setTimeout(step, DELETE_SPEED_MS);
    } else {
      typewriterTimer = setTimeout(() => {
        deleting = false;
        step();
      }, HOLD_AFTER_DELETE_MS);
    }
  };

  typewriterTimer = setTimeout(step, TYPE_SPEED_MS);
}

function getQuotes() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [QUOTES_KEY]: [] }, (data) => {
      resolve(data[QUOTES_KEY]);
    });
  });
}

function getSites() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [SITES_KEY]: [] }, (data) => {
      resolve(data[SITES_KEY]);
    });
  });
}

function setSites(sites) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SITES_KEY]: sites }, () => resolve());
  });
}

function getQuickNote() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [NOTE_KEY]: "" }, (data) => {
      resolve((data[NOTE_KEY] || "").toString());
    });
  });
}

function setQuickNote(value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [NOTE_KEY]: value }, () => resolve());
  });
}

function getTheme() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [THEME_KEY]: "" }, (data) => {
      resolve(data[THEME_KEY]);
    });
  });
}

function setTheme(theme) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [THEME_KEY]: theme }, () => resolve());
  });
}

function pickRandom(quotes, lastIndex) {
  if (quotes.length === 0) return { quote: null, index: -1 };
  if (quotes.length === 1) return { quote: quotes[0], index: 0 };

  let index = lastIndex;
  while (index === lastIndex) {
    index = Math.floor(Math.random() * quotes.length);
  }
  return { quote: quotes[index], index };
}

function normalizeQuote(raw) {
  if (typeof raw === "string") {
    return { text: raw.trim(), author: "" };
  }
  return {
    text: (raw.text || "").toString().trim(),
    author: (raw.author || "").toString().trim(),
  };
}

function normalizeSite(raw) {
  if (!raw) return null;
  const name = (raw.name || "").toString().trim();
  const url = (raw.url || "").toString().trim();
  const icon = (raw.icon || "").toString().trim();
  if (!name || !url) return null;
  return { name, url, icon: icon || null };
}

function normalizeUrl(input) {
  let url = input.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const toggle = document.getElementById("themeToggle");
  const isDark = theme === "dark";
  toggle.setAttribute("aria-pressed", isDark ? "true" : "false");
  toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

async function initTheme() {
  let theme = await getTheme();
  if (!theme) {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  applyTheme(theme);
}

async function toggleTheme() {
  const current = document.body.dataset.theme || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await setTheme(next);
}

async function renderQuote(lastIndex = -1) {
  const quotesRaw = await getQuotes();
  const quotes = quotesRaw.map(normalizeQuote).filter((q) => q.text.length > 0);

  const emptyState = document.getElementById("emptyState");
  const card = document.querySelector(".card");
  if (quotes.length === 0) {
    clearTypewriter();
    const quoteText = document.getElementById("quoteText");
    quoteText.textContent = "";
    emptyState.hidden = false;
    card.style.display = "none";
    return { quotes, index: -1 };
  }

  emptyState.hidden = true;
  card.style.display = "block";

  const { quote, index } = pickRandom(quotes, lastIndex);
  const quoteText = document.getElementById("quoteText");
  const quoteAuthor = document.getElementById("quoteAuthor");

  startTypewriterLoop(quote.text);
  quoteAuthor.textContent = quote.author ? `-- ${quote.author}` : "";

  return { quotes, index };
}

function openOptionsPage() {
  if (chrome.runtime && chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
}

function labelFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (err) {
    return url;
  }
}

function renderAddTile(container) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tile tile-add";
  button.setAttribute("aria-label", "Add site");
  button.dataset.role = "add";
  button.draggable = false;

  const icon = document.createElement("div");
  icon.className = "tile-icon";
  icon.textContent = "+";

  const label = document.createElement("div");
  label.className = "tile-label";
  label.textContent = "Add site";

  button.append(icon, label);
  button.addEventListener("click", () => openSiteModal("add"));

  container.appendChild(button);
}

function reorderSites(list, fromIndex, toIndex) {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

async function renderSites() {
  const container = document.getElementById("siteList");
  const empty = document.getElementById("sitesEmpty");
  container.innerHTML = "";

  const sitesRaw = await getSites();
  const sites = sitesRaw.map(normalizeSite).filter(Boolean);

  empty.hidden = sites.length !== 0;

  sites.forEach((site, index) => {
    const link = document.createElement("a");
    link.className = "tile";
    link.href = site.url;
    link.title = site.name || site.url;
    link.draggable = true;
    link.dataset.index = index.toString();

    link.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", index.toString());
      link.classList.add("dragging");
    });

    link.addEventListener("dragend", () => {
      link.classList.remove("dragging");
      container.querySelectorAll(".tile-drop-target").forEach((el) => el.classList.remove("tile-drop-target"));
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tile-remove";
    remove.setAttribute("aria-label", `Remove ${site.name}`);
    remove.textContent = "x";
    remove.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = sites.filter((_, idx) => idx !== index);
      await setSites(next);
      await renderSites();
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "tile-edit";
    edit.setAttribute("aria-label", `Edit ${site.name}`);
    edit.textContent = "e";
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSiteModal("edit", site, index);
    });

    const icon = document.createElement("div");
    icon.className = "tile-icon";
    const img = document.createElement("img");
    img.alt = "";
    // Prefer stored icon, then browser favicon, then Google s2 fallback
    if (site.icon) {
      img.src = site.icon;
    } else {
      img.src = `chrome://favicon2/?size=64&url=${encodeURIComponent(site.url)}`;
      img.onerror = () => {
        try {
          const parsed = new URL(site.url);
          img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
        } catch (e) {
          img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.url)}&sz=64`;
        }
      };
    }
    icon.appendChild(img);

    const label = document.createElement("div");
    label.className = "tile-label";
    label.textContent = site.name || labelFromUrl(site.url);

    link.append(edit, remove, icon, label);
    container.appendChild(link);
  });

  renderAddTile(container);

  container.querySelectorAll(".tile").forEach((tile) => {
    if (tile.dataset.role === "add") return;
    tile.addEventListener("dragover", (event) => {
      event.preventDefault();
      const target = event.currentTarget;
      container.querySelectorAll(".tile-drop-target").forEach((el) => el.classList.remove("tile-drop-target"));
      target.classList.add("tile-drop-target");
    });

    tile.addEventListener("drop", async (event) => {
      event.preventDefault();
      const fromIndex = Number(event.dataTransfer.getData("text/plain"));
      const toIndex = Number(tile.dataset.index);
      if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) return;
      const next = reorderSites(sites, fromIndex, toIndex);
      await setSites(next);
      await renderSites();
    });
  });
}

function setupContainerDnD() {
  if (dndReady) return;
  const container = document.getElementById("siteList");
  container.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  container.addEventListener("drop", async (event) => {
    const addTile = container.querySelector("[data-role='add']");
    if (!addTile) return;
    if (event.target !== addTile && !addTile.contains(event.target)) return;
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isNaN(fromIndex)) return;
    const sitesRaw = await getSites();
    const sites = sitesRaw.map(normalizeSite).filter(Boolean);
    const next = reorderSites(sites, fromIndex, sites.length);
    await setSites(next);
    await renderSites();
  });

  dndReady = true;
}

function openSiteModal(mode, site = null, index = null) {
  editIndex = mode === "edit" ? index : null;
  const modal = document.getElementById("siteModal");
  const title = document.getElementById("siteModalTitle");
  const submit = document.getElementById("addSite");
  const nameInput = document.getElementById("siteName");
  const urlInput = document.getElementById("siteUrl");

  if (mode === "edit" && site) {
    title.textContent = "Edit site";
    submit.textContent = "Save";
    nameInput.value = site.name || "";
    urlInput.value = site.url || "";
  } else {
    title.textContent = "Add site";
    submit.textContent = "Add";
    document.getElementById("addSiteForm").reset();
  }

  modal.hidden = false;
  nameInput.focus();

  escHandler = (event) => {
    if (event.key === "Escape") {
      closeSiteModal();
    }
  };
  document.addEventListener("keydown", escHandler);
}

function closeSiteModal() {
  editIndex = null;
  const modal = document.getElementById("siteModal");
  modal.hidden = true;
  document.getElementById("addSiteForm").reset();
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

async function handleAddSite(event) {
  event.preventDefault();
  const nameInput = document.getElementById("siteName");
  const urlInput = document.getElementById("siteUrl");

  const name = nameInput.value.trim();
  const url = normalizeUrl(urlInput.value);
  if (!url) return;

  const sitesRaw = await getSites();
  const sites = sitesRaw.map(normalizeSite).filter(Boolean);
  // compute a sensible favicon URL and store it with the site
  let icon = null;
  try {
    const parsed = new URL(url);
    icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch (e) {
    icon = null;
  }

  if (editIndex !== null) {
    const updated = { name: name || labelFromUrl(url), url, icon };
    sites.splice(editIndex, 1, updated);
  } else {
    sites.push({ name: name || labelFromUrl(url), url, icon });
  }
  await setSites(sites);

  nameInput.value = "";
  urlInput.value = "";
  closeSiteModal();
  await renderSites();
}

let lastIndex = -1;

function setNotesExpanded(expanded) {
  const notesBox = document.getElementById("quickNotes");
  const toggle = document.getElementById("notesToggle");
  const input = document.getElementById("notesInput");
  if (!notesBox || !toggle || !input) return;

  notesBox.classList.toggle("is-collapsed", !expanded);
  toggle.textContent = expanded ? "-" : "+";
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");

  if (expanded) {
    input.focus();
  }
}

function updateNotesPreview(text) {
  const preview = document.getElementById("notesPreview");
  if (!preview) return;
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  preview.textContent = normalized || "Add a quick reminder...";
}

function scheduleNoteSave(text) {
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
  }
  noteSaveTimer = setTimeout(() => {
    setQuickNote(text);
  }, NOTE_SAVE_DEBOUNCE_MS);
}

async function initQuickNotes() {
  const notesBox = document.getElementById("quickNotes");
  const toggle = document.getElementById("notesToggle");
  const preview = document.getElementById("notesPreview");
  const input = document.getElementById("notesInput");
  if (!notesBox || !toggle || !preview || !input) return;

  const saved = await getQuickNote();
  input.value = saved;
  updateNotesPreview(saved);
  setNotesExpanded(false);

  toggle.addEventListener("click", () => {
    const collapsed = notesBox.classList.contains("is-collapsed");
    setNotesExpanded(collapsed);
  });

  preview.addEventListener("click", () => {
    setNotesExpanded(true);
  });

  input.addEventListener("input", () => {
    const text = input.value;
    updateNotesPreview(text);
    scheduleNoteSave(text);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!notesBox.contains(document.activeElement)) {
        setNotesExpanded(false);
      }
    }, 120);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
      setNotesExpanded(false);
    }
  });
}

function formatSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (sec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function setMeditationPhase(phase) {
  const card = document.getElementById("meditationCard");
  const breathText = document.getElementById("breathText");
  if (!card || !breathText) return;

  meditationPhase = phase;
  card.classList.remove("is-inhale", "is-exhale");
  card.classList.add(phase === "inhale" ? "is-inhale" : "is-exhale");
  breathText.textContent = phase === "inhale" ? "Breathe in" : "Breathe out";
}

function stopMeditation(keepTimer = false) {
  meditationRunning = false;
  if (meditationTickTimer) {
    clearInterval(meditationTickTimer);
    meditationTickTimer = null;
  }
  if (meditationPhaseTimer) {
    clearTimeout(meditationPhaseTimer);
    meditationPhaseTimer = null;
  }

  const startBtn = document.getElementById("meditationStart");
  const timer = document.getElementById("meditationTimer");
  const breathText = document.getElementById("breathText");
  const card = document.getElementById("meditationCard");
  if (startBtn) startBtn.textContent = "Start";
  if (card) card.classList.remove("is-inhale", "is-exhale");
  if (breathText) breathText.textContent = "Ready";
  if (!keepTimer && timer) timer.textContent = "00:00";
}

function scheduleMeditationPhaseSwitch() {
  if (!meditationRunning) return;
  const nextPhase = meditationPhase === "inhale" ? "exhale" : "inhale";
  const waitMs = meditationPhase === "inhale" ? BREATH_IN_MS : BREATH_OUT_MS;

  meditationPhaseTimer = setTimeout(() => {
    if (!meditationRunning) return;
    setMeditationPhase(nextPhase);
    scheduleMeditationPhaseSwitch();
  }, waitMs);
}

function startMeditation(minutes) {
  const durationMs = Math.max(1, minutes) * 60 * 1000;
  const timer = document.getElementById("meditationTimer");
  const startBtn = document.getElementById("meditationStart");

  stopMeditation(true);
  meditationRunning = true;
  meditationEndAt = Date.now() + durationMs;
  if (startBtn) startBtn.textContent = "Running";
  setMeditationPhase("inhale");

  if (timer) {
    timer.textContent = formatSeconds(Math.ceil(durationMs / 1000));
  }

  meditationTickTimer = setInterval(() => {
    const secondsLeft = Math.ceil((meditationEndAt - Date.now()) / 1000);
    if (timer) {
      timer.textContent = formatSeconds(secondsLeft);
    }
    if (secondsLeft <= 0) {
      stopMeditation(false);
    }
  }, 250);

  scheduleMeditationPhaseSwitch();
}

function initMeditation() {
  const durationSelect = document.getElementById("meditationMinutes");
  const startBtn = document.getElementById("meditationStart");
  const stopBtn = document.getElementById("meditationStop");

  if (!durationSelect || !startBtn || !stopBtn) return;

  startBtn.addEventListener("click", () => {
    if (meditationRunning) return;
    const minutes = Number(durationSelect.value || "3");
    startMeditation(minutes);
  });

  stopBtn.addEventListener("click", () => {
    stopMeditation(false);
  });
}

function calculateYearProgress() {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Start of year
  const startOfYear = new Date(currentYear, 0, 1);
  
  // End of year
  const endOfYear = new Date(currentYear, 11, 31);
  
  // Days completed (from Jan 1 to today)
  const daysCompleted = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
  
  // Total days in the year
  const totalDays = Math.floor((endOfYear - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
  
  // Days left (not including today)
  const daysLeft = totalDays - daysCompleted;
  
  // Percentage completed
  const percentage = Math.floor((daysCompleted / totalDays) * 100);
  
  return {
    daysCompleted,
    daysLeft,
    totalDays,
    percentage,
    currentDate: now
  };
}

function renderProgressGrid() {
  const progress = calculateYearProgress();
  const gridContainer = document.getElementById("progressGrid");
  const statsContainer = document.getElementById("progressStats");
  
  // Clear existing content
  gridContainer.innerHTML = "";
  
  // Create 365 day dots
  for (let i = 1; i <= progress.totalDays; i++) {
    const dot = document.createElement("div");
    dot.className = "progress-day";
    
    if (i <= progress.daysCompleted) {
      dot.classList.add("completed");
    }
    
    gridContainer.appendChild(dot);
  }
  
  // Format date
  const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = progress.currentDate.toLocaleDateString('en-US', dateOptions);
  
  // Update stats
  statsContainer.innerHTML = `
    <div><span class="stats-number">${progress.daysCompleted}</span> days completed</div>
    <div><span class="stats-number">${progress.daysLeft}</span> days left</div>
    <div style="margin-top: 8px; font-size: 12px; color: var(--muted);">${dateStr}</div>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  renderProgressGrid();
  setupContainerDnD();
  await renderSites();
  await initQuickNotes();
  initMeditation();

  const state = await renderQuote();
  lastIndex = state.index;

  document.getElementById("nextQuote").addEventListener("click", async () => {
    const next = await renderQuote(lastIndex);
    lastIndex = next.index;
  });

  document.getElementById("manageQuotes").addEventListener("click", openOptionsPage);
  document.getElementById("openOptions").addEventListener("click", openOptionsPage);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  document.getElementById("closeModal").addEventListener("click", closeSiteModal);
  document.getElementById("cancelAdd").addEventListener("click", closeSiteModal);
  document.getElementById("addSiteForm").addEventListener("submit", handleAddSite);

  document.getElementById("siteModal").addEventListener("click", (event) => {
    if (event.target.id === "siteModal") {
      closeSiteModal();
    }
  });
});
