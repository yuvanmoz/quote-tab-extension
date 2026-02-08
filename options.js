const QUOTES_KEY = "quotes";
const THEME_KEY = "theme";
const WHITELIST_KEY = "whitelist";

function getQuotes() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [QUOTES_KEY]: [] }, (data) => {
      resolve(data[QUOTES_KEY]);
    });
  });
}

function setQuotes(quotes) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [QUOTES_KEY]: quotes }, () => resolve());
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
}

function initTheme() {
  chrome.storage.sync.get({ [THEME_KEY]: "" }, (data) => {
    const theme = data[THEME_KEY] || "light";
    applyTheme(theme);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[THEME_KEY]) return;
    applyTheme(changes[THEME_KEY].newValue || "light");
  });
}

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
  host = host.replace(/^www\./, "").replace(/^m\./, "");
  return host;
}

function initWhitelist() {
  const input = document.getElementById("whitelistInput");
  const status = document.getElementById("whitelistStatus");
  const saveBtn = document.getElementById("saveWhitelist");

  chrome.storage.sync.get({ [WHITELIST_KEY]: [] }, (data) => {
    const list = Array.isArray(data[WHITELIST_KEY]) ? data[WHITELIST_KEY] : [];
    input.value = list.join("\n");
  });

  saveBtn.addEventListener("click", () => {
    const lines = input.value.split(/\r?\n/).map(normalizeDomain).filter(Boolean);
    chrome.storage.sync.set({ [WHITELIST_KEY]: lines }, () => {
      if (status) {
        status.textContent = "Saved";
        setTimeout(() => (status.textContent = ""), 1500);
      }
    });
  });
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

function createQuoteItem(quote, index, onSave, onDelete) {
  const item = document.createElement("div");
  item.className = "quote-item";

  // Collapsed row
  const row = document.createElement("div");
  row.className = "quote-row";

  const rowText = document.createElement("div");
  rowText.className = "row-text";
  rowText.textContent = quote.text;

  const rowAuthor = document.createElement("div");
  rowAuthor.className = "row-author";
  rowAuthor.textContent = quote.author ? `— ${quote.author}` : "";

  const rowActions = document.createElement("div");
  rowActions.className = "row-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.setAttribute("aria-label", "Edit quote");
  editBtn.textContent = "✎";

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "icon-btn danger";
  delBtn.setAttribute("aria-label", "Delete quote");
  delBtn.textContent = "🗑";

  rowActions.append(editBtn, delBtn);
  row.append(rowText, rowAuthor, rowActions);

  // Edit form (hidden by default)
  const editContainer = document.createElement("div");
  editContainer.className = "quote-edit";
  editContainer.style.display = "none";

  const textField = document.createElement("div");
  textField.className = "field";
  const textLabel = document.createElement("label");
  textLabel.textContent = "Quote";
  const textArea = document.createElement("textarea");
  textArea.rows = 2;
  textArea.value = quote.text;
  textField.append(textLabel, textArea);

  const authorField = document.createElement("div");
  authorField.className = "field";
  const authorLabel = document.createElement("label");
  authorLabel.textContent = "Author (optional)";
  const authorInput = document.createElement("input");
  authorInput.value = quote.author;
  authorField.append(authorLabel, authorInput);

  const editActions = document.createElement("div");
  editActions.className = "quote-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "icon-btn";
  saveBtn.setAttribute("aria-label", "Save quote");
  saveBtn.textContent = "✓";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "icon-btn";
  cancelBtn.setAttribute("aria-label", "Cancel edit");
  cancelBtn.textContent = "✖";

  editActions.append(saveBtn, cancelBtn);
  editContainer.append(textField, authorField, editActions);

  // Wire up interactions
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    item.classList.add("editing");
    row.style.display = "none";
    editContainer.style.display = "block";
    textArea.focus();
  });

  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // revert edits
    textArea.value = rowText.textContent;
    authorInput.value = quote.author || "";
    item.classList.remove("editing");
    editContainer.style.display = "none";
    row.style.display = "flex";
  });

  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await onSave(index, { text: textArea.value, author: authorInput.value }, item);
  });

  delBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await onDelete(index, item);
  });

  item.append(row, editContainer);
  return item;
}

function parseBulkInput(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    let textPart = line;
    let authorPart = "";

    if (line.includes(" - ")) {
      [textPart, authorPart] = line.split(" - ", 2);
    }

    return {
      text: textPart.trim(),
      author: authorPart.trim(),
    };
  }).filter((quote) => quote.text.length > 0);
}

async function renderList() {
  const quoteList = document.getElementById("quoteList");
  const emptyList = document.getElementById("emptyList");
  const countEl = document.getElementById("quoteCount");
  // preserve scroll position to avoid jarring jumps
  const prevScroll = quoteList.scrollTop;
  quoteList.innerHTML = "";

  const quotesRaw = await getQuotes();
  const quotes = quotesRaw.map(normalizeQuote).filter((q) => q.text.length > 0);
  if (countEl) countEl.textContent = quotes.length.toString();

  if (quotes.length === 0) {
    emptyList.hidden = false;
    return;
  }

  emptyList.hidden = true;

  quotes.forEach((quote, index) => {
    const item = createQuoteItem(quote, index, async (i, updated, itemElem) => {
      const next = [...quotes];
      next[i] = normalizeQuote(updated);
      await setQuotes(next);

      // update collapsed view in-place
      const rowText = itemElem.querySelector('.row-text');
      const rowAuthor = itemElem.querySelector('.row-author');
      rowText.textContent = next[i].text;
      rowAuthor.textContent = next[i].author ? `— ${next[i].author}` : '';

      // exit edit mode
      itemElem.classList.remove('editing');
      const editContainer = itemElem.querySelector('.quote-edit');
      const rowEl = itemElem.querySelector('.quote-row');
      if (editContainer) editContainer.style.display = 'none';
      if (rowEl) rowEl.style.display = 'flex';
    }, async (i, itemElem) => {
      const next = quotes.filter((_, idx) => idx !== i);
      await setQuotes(next);
      // re-render full list to keep indices accurate and simplify logic
      await renderList();
    });

    quoteList.appendChild(item);
  });

  // restore scroll
  quoteList.scrollTop = prevScroll;
}

async function addQuote() {
  const textEl = document.getElementById("quoteText");
  const authorEl = document.getElementById("quoteAuthor");

  const text = textEl.value.trim();
  const author = authorEl.value.trim();

  if (!text) return;

  const quotes = (await getQuotes()).map(normalizeQuote).filter((q) => q.text.length > 0);
  quotes.push({ text, author });
  await setQuotes(quotes);

  textEl.value = "";
  authorEl.value = "";
  await renderList();
}

async function importQuotes() {
  const bulkInput = document.getElementById("bulkInput");
  const parsed = parseBulkInput(bulkInput.value);
  if (parsed.length === 0) return;

  const quotes = (await getQuotes()).map(normalizeQuote).filter((q) => q.text.length > 0);
  await setQuotes([...quotes, ...parsed]);

  bulkInput.value = "";
  await renderList();
}

async function clearAllQuotes() {
  const ok = confirm("Clear all quotes? This cannot be undone.");
  if (!ok) return;
  await setQuotes([]);
  await renderList();
}

async function exportQuotes() {
  const quotes = (await getQuotes()).map(normalizeQuote).filter((q) => q.text.length > 0);
  if (quotes.length === 0) {
    alert("No quotes to export.");
    return;
  }

  const lines = [];
  const now = new Date();
  lines.push("Quote Export");
  lines.push(`Generated: ${now.toISOString()}`);
  lines.push("");

  quotes.forEach((quote, index) => {
    lines.push(`${index + 1}. ${quote.text}`);
    if (quote.author) {
      lines.push(`   - ${quote.author}`);
    }
    lines.push("");
  });

  const content = lines.join("\r\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateTag = now.toISOString().slice(0, 10);

  link.href = url;
  link.download = `quotes-export-${dateTag}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initWhitelist();
  document.getElementById("addQuote").addEventListener("click", addQuote);
  document.getElementById("importQuotes").addEventListener("click", importQuotes);
  document.getElementById("exportQuotes").addEventListener("click", exportQuotes);
  document.getElementById("clearAll").addEventListener("click", clearAllQuotes);
  renderList();
});
