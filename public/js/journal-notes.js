// Mythical Blue · Categorized journal notes
// Reliable expandable notes with search, category filtering, sorting, and custom categories.

const DEFAULT_JOURNAL_NOTE_CATEGORIES = [
  "NPCs",
  "Quests",
  "Locations",
  "Organizations",
  "Lore",
  "Session Notes",
  "Clues",
  "Items",
  "Other"
];

const CREATE_JOURNAL_CATEGORY_VALUE = "__create_journal_category__";

function journalNoteId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `note-${crypto.randomUUID()}`;
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function journalNoteSafe(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeJournalCategory(value = "") {
  return String(value || "").trim() || "Other";
}

function getJournalNoteRows() {
  return Array.from(document.querySelectorAll("#journalNotesList .journal-note-entry"));
}

function getJournalEntryCategory(entry) {
  return normalizeJournalCategory(entry.querySelector(".journal-note-category")?.value || entry.dataset.category);
}

function getJournalEntryTitle(entry) {
  return String(entry.querySelector(".journal-note-title")?.value || "").trim() || "Untitled Note";
}

function getJournalNoteCategories() {
  const categories = new Set(DEFAULT_JOURNAL_NOTE_CATEGORIES);
  getJournalNoteRows().forEach(entry => categories.add(getJournalEntryCategory(entry)));
  return Array.from(categories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function journalCategoryOptionsMarkup(selectedCategory, includeCreate = true) {
  const selected = normalizeJournalCategory(selectedCategory);
  const categories = new Set(getJournalNoteCategories());
  categories.add(selected);
  const options = Array.from(categories)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(category => `<option value="${journalNoteSafe(category)}"${category === selected ? " selected" : ""}>${journalNoteSafe(category)}</option>`)
    .join("");
  return `${options}${includeCreate ? `<option value="${CREATE_JOURNAL_CATEGORY_VALUE}">+ Create category…</option>` : ""}`;
}

function updateJournalNoteSummary(entry) {
  const summary = entry.querySelector(".journal-note-summary-text");
  const category = getJournalEntryCategory(entry);
  const title = getJournalEntryTitle(entry);
  entry.dataset.category = category;
  if (summary) summary.textContent = `${category} · ${title}`;
}

function refreshJournalNoteCategoryOptions() {
  const categories = getJournalNoteCategories();
  const filter = document.getElementById("journalNoteFilter");

  getJournalNoteRows().forEach(entry => {
    const select = entry.querySelector(".journal-note-category");
    if (!select) return;
    const selected = normalizeJournalCategory(select.value || entry.dataset.category);
    select.innerHTML = journalCategoryOptionsMarkup(selected, true);
    select.value = selected;
    entry.dataset.category = selected;
  });

  if (filter) {
    const previous = filter.value || "all";
    filter.innerHTML = `<option value="all">All Categories</option>${categories
      .map(category => `<option value="${journalNoteSafe(category)}">${journalNoteSafe(category)}</option>`)
      .join("")}`;
    filter.value = categories.includes(previous) ? previous : "all";
  }

  applyJournalNoteView();
}

function applyJournalNoteView() {
  const entries = getJournalNoteRows();
  const filter = document.getElementById("journalNoteFilter")?.value || "all";
  const query = String(document.getElementById("journalNoteSearch")?.value || "").trim().toLowerCase();
  const sort = document.getElementById("journalNoteSort")?.value || "manual";

  const sorters = {
    titleAsc: (a, b) => getJournalEntryTitle(a).localeCompare(getJournalEntryTitle(b), undefined, { sensitivity: "base" }),
    titleDesc: (a, b) => getJournalEntryTitle(b).localeCompare(getJournalEntryTitle(a), undefined, { sensitivity: "base" }),
    categoryAsc: (a, b) => {
      const categoryCompare = getJournalEntryCategory(a).localeCompare(getJournalEntryCategory(b), undefined, { sensitivity: "base" });
      return categoryCompare || getJournalEntryTitle(a).localeCompare(getJournalEntryTitle(b), undefined, { sensitivity: "base" });
    }
  };

  const orderedEntries = sorters[sort] ? [...entries].sort(sorters[sort]) : entries;
  orderedEntries.forEach((entry, index) => { entry.style.order = String(index); });

  let visibleCount = 0;
  entries.forEach(entry => {
    const category = getJournalEntryCategory(entry);
    const title = getJournalEntryTitle(entry);
    const body = String(entry.querySelector(".journal-note-text")?.value || "");
    const matchesCategory = filter === "all" || category === filter;
    const matchesSearch = !query || `${category} ${title} ${body}`.toLowerCase().includes(query);
    entry.hidden = !(matchesCategory && matchesSearch);
    if (!entry.hidden) visibleCount += 1;
  });

  const count = document.getElementById("journalNoteCount");
  if (count) count.textContent = `${visibleCount} of ${entries.length} note${entries.length === 1 ? "" : "s"}`;

  const empty = document.getElementById("journalNotesEmptyState");
  if (empty) empty.hidden = visibleCount > 0 || entries.length === 0;
}

function clearJournalNoteFilters() {
  const search = document.getElementById("journalNoteSearch");
  const filter = document.getElementById("journalNoteFilter");
  const sort = document.getElementById("journalNoteSort");
  if (search) search.value = "";
  if (filter) filter.value = "all";
  if (sort) sort.value = "manual";
  applyJournalNoteView();
}

function createJournalCategory(select, entry) {
  const previous = normalizeJournalCategory(entry.dataset.category || "Other");
  const category = prompt("Create a journal-note category:", "")?.trim();
  if (!category) {
    select.value = previous;
    return;
  }
  entry.dataset.category = category;
  refreshJournalNoteCategoryOptions();
  select.value = category;
  updateJournalNoteSummary(entry);
  applyJournalNoteView();
}

function addJournalNote(data = {}) {
  const list = document.getElementById("journalNotesList");
  if (!list) return null;

  const note = {
    id: String(data.id || journalNoteId()),
    category: normalizeJournalCategory(data.category),
    title: String(data.title || ""),
    body: String(data.body || ""),
    open: data.open === true
  };

  const entry = document.createElement("details");
  entry.className = "journal-note-entry";
  entry.dataset.noteId = note.id;
  entry.dataset.category = note.category;
  entry.open = note.open;

  entry.innerHTML = `
    <summary>
      <span class="journal-note-summary-text"></span>
      <span class="journal-note-summary-hint" aria-hidden="true">▾</span>
    </summary>

    <div class="journal-note-body">
      <div class="journal-note-meta">
        <label>
          <span>Category</span>
          <select class="journal-note-category" aria-label="Journal note category">
            ${journalCategoryOptionsMarkup(note.category, true)}
          </select>
        </label>

        <label class="journal-note-title-label">
          <span>Title</span>
          <input class="journal-note-title" value="${journalNoteSafe(note.title)}" placeholder="Untitled Note">
        </label>

        <button type="button" class="journal-note-remove" title="Delete note" aria-label="Delete note">×</button>
      </div>

      <textarea class="journal-note-text" placeholder="Write your note here…">${journalNoteSafe(note.body)}</textarea>
    </div>
  `;

  list.appendChild(entry);
  updateJournalNoteSummary(entry);

  const categorySelect = entry.querySelector(".journal-note-category");
  const titleInput = entry.querySelector(".journal-note-title");
  const bodyInput = entry.querySelector(".journal-note-text");

  categorySelect?.addEventListener("change", () => {
    if (categorySelect.value === CREATE_JOURNAL_CATEGORY_VALUE) {
      createJournalCategory(categorySelect, entry);
      return;
    }
    entry.dataset.category = normalizeJournalCategory(categorySelect.value);
    updateJournalNoteSummary(entry);
    refreshJournalNoteCategoryOptions();
  });

  titleInput?.addEventListener("input", () => {
    updateJournalNoteSummary(entry);
    applyJournalNoteView();
  });

  bodyInput?.addEventListener("input", applyJournalNoteView);

  entry.querySelector(".journal-note-remove")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`Delete “${getJournalEntryTitle(entry)}”?`)) return;
    entry.remove();
    refreshJournalNoteCategoryOptions();
  });

  refreshJournalNoteCategoryOptions();
  return entry;
}

function addJournalNoteFromToolbar() {
  const entry = addJournalNote({ category: "Other", title: "", open: true });
  if (!entry) return;
  clearJournalNoteFilters();
  entry.open = true;
  entry.scrollIntoView({ behavior: "smooth", block: "nearest" });
  entry.querySelector(".journal-note-title")?.focus();
}

function collectJournalNotes() {
  return getJournalNoteRows().map(entry => ({
    id: entry.dataset.noteId,
    category: getJournalEntryCategory(entry),
    title: getJournalEntryTitle(entry),
    body: entry.querySelector(".journal-note-text")?.value || "",
    open: entry.open
  }));
}

function resetJournalNotes(notes = []) {
  const list = document.getElementById("journalNotesList");
  if (!list) return;
  list.innerHTML = "";
  (notes || []).forEach(addJournalNote);
  refreshJournalNoteCategoryOptions();
}

function bindJournalNotesControls() {
  document.getElementById("journalNoteSearch")?.addEventListener("input", applyJournalNoteView);
  document.getElementById("journalNoteFilter")?.addEventListener("change", applyJournalNoteView);
  document.getElementById("journalNoteSort")?.addEventListener("change", applyJournalNoteView);
  document.getElementById("journalClearFiltersBtn")?.addEventListener("click", clearJournalNoteFilters);
  document.getElementById("journalAddNoteBtn")?.addEventListener("click", addJournalNoteFromToolbar);
  refreshJournalNoteCategoryOptions();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindJournalNotesControls);
} else {
  bindJournalNotesControls();
}
