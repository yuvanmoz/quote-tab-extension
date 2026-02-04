const QUOTES_KEY = "quotes";
const THEME_KEY = "theme";
const SITES_KEY = "sites";
let editIndex = null;
let dndReady = false;
let escHandler = null;

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
    emptyState.hidden = false;
    card.style.display = "none";
    return { quotes, index: -1 };
  }

  emptyState.hidden = true;
  card.style.display = "block";

  const { quote, index } = pickRandom(quotes, lastIndex);
  const quoteText = document.getElementById("quoteText");
  const quoteAuthor = document.getElementById("quoteAuthor");

  quoteText.textContent = quote.text;
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

document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  setupContainerDnD();
  await renderSites();

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
