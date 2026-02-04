const QUOTES_KEY = "quotes";

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

function normalizeQuote(raw) {
  if (typeof raw === "string") {
    return { text: raw.trim(), author: "" };
  }
  return {
    text: (raw.text || "").toString().trim(),
    author: (raw.author || "").toString().trim(),
  };
}

function createQuoteItem(quote, index, onUpdate, onDelete) {
  const item = document.createElement("div");
  item.className = "quote-item";

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

  const actions = document.createElement("div");
  actions.className = "quote-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.addEventListener("click", () => {
    onUpdate(index, {
      text: textArea.value,
      author: authorInput.value,
    });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.classList.add("danger");
  deleteButton.addEventListener("click", () => onDelete(index));

  actions.append(saveButton, deleteButton);

  item.append(textField, authorField, actions);
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
    const item = createQuoteItem(quote, index, async (i, updated) => {
      const next = [...quotes];
      next[i] = normalizeQuote(updated);
      await setQuotes(next);
      await renderList();
    }, async (i) => {
      const next = quotes.filter((_, idx) => idx !== i);
      await setQuotes(next);
      await renderList();
    });

    quoteList.appendChild(item);
  });
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

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addQuote").addEventListener("click", addQuote);
  document.getElementById("importQuotes").addEventListener("click", importQuotes);
  document.getElementById("clearAll").addEventListener("click", clearAllQuotes);
  renderList();
});
