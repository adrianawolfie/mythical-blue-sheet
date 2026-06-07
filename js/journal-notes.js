// Mythical Blue · Categorized journal notes
// Expandable note entries with category filtering and flexible custom categories.

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

function getJournalNoteRows() {
  return Array.from(document.querySelectorAll("#journalNotesList .journal-note-entry"));
}

function getJournalNoteCategories() {
  const categories = new Set(DEFAULT_JOURNAL_NOTE_CATEGORIES);

  getJournalNoteRows().forEach(entry => {
    const category = entry.querySelector(".journal-note-category")?.value.trim();
    if (category) categories.add(category);
  });

  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

function refreshJournalNoteCategoryOptions() {
  const categories = getJournalNoteCategories();
  const datalist = document.getElementById("journalNoteCategoryOptions");
  const filter = document.getElementById("journalNoteFilter");

  if (datalist) {
    datalist.innerHTML = categories
      .map(category => `<option value="${journalNoteSafe(category)}"></option>`)
      .join("");
  }

  if (filter) {
    const previous = filter.value || "all";
    filter.innerHTML = `
      <option value="all">All Categories</option>
      ${categories
        .map(category => `
          <option value="${journalNoteSafe(category)}">
            ${journalNoteSafe(category)}
          </option>
        `)
        .join("")}
    `;

    filter.value = Array.from(filter.options).some(option => option.value === previous)
      ? previous
      : "all";
  }

  applyJournalNoteFilter();
}

function updateJournalNoteSummary(entry) {
  const summary = entry.querySelector(".journal-note-summary-text");
  const category = entry.querySelector(".journal-note-category")?.value.trim() || "Other";
  const title = entry.querySelector(".journal-note-title")?.value.trim() || "Untitled Note";

  if (summary) summary.textContent = `${category} — ${title}`;
}

function applyJournalNoteFilter() {
  const filter = document.getElementById("journalNoteFilter")?.value || "all";

  getJournalNoteRows().forEach(entry => {
    const category = entry.querySelector(".journal-note-category")?.value.trim() || "Other";
    entry.hidden = filter !== "all" && category !== filter;
  });
}

function addJournalNote(data = {}) {
  const list = document.getElementById("journalNotesList");
  if (!list) return;

  const note = {
    id: String(data.id || journalNoteId()),
    category: String(data.category || "Other"),
    title: String(data.title || ""),
    body: String(data.body || ""),
    open: data.open === true
  };

  const entry = document.createElement("details");
  entry.className = "journal-note-entry";
  entry.dataset.noteId = note.id;
  entry.open = note.open;

  entry.innerHTML = `
    <summary>
      <span class="journal-note-summary-text"></span>
      <span class="journal-note-summary-hint">▾</span>
    </summary>

    <div class="journal-note-body">
      <div class="journal-note-meta">
        <label>
          <span>Category</span>
          <input
            class="journal-note-category"
            list="journalNoteCategoryOptions"
            value="${journalNoteSafe(note.category)}"
            placeholder="NPCs, Quests, Lore…"
          >
        </label>

        <label class="journal-note-title-label">
          <span>Title</span>
          <input
            class="journal-note-title"
            value="${journalNoteSafe(note.title)}"
            placeholder="Untitled Note"
          >
        </label>

        <button type="button" class="journal-note-remove" title="Delete note" aria-label="Delete note">×</button>
      </div>

      <textarea
        class="journal-note-text"
        placeholder="Write your note here…"
      >${journalNoteSafe(note.body)}</textarea>
    </div>
  `;

  list.appendChild(entry);
  updateJournalNoteSummary(entry);

  const categoryInput = entry.querySelector(".journal-note-category");
  const titleInput = entry.querySelector(".journal-note-title");

  categoryInput?.addEventListener("input", () => {
    updateJournalNoteSummary(entry);
    refreshJournalNoteCategoryOptions();
  });

  titleInput?.addEventListener("input", () => updateJournalNoteSummary(entry));

  entry.querySelector(".journal-note-remove")?.addEventListener("click", event => {
    event.preventDefault();
    entry.remove();
    refreshJournalNoteCategoryOptions();
  });

  refreshJournalNoteCategoryOptions();
}

function addJournalNoteFromToolbar() {
  const categoryInput = document.getElementById("journalNewNoteCategory");
  const titleInput = document.getElementById("journalNewNoteTitle");

  addJournalNote({
    category: categoryInput?.value.trim() || "Other",
    title: titleInput?.value.trim() || "Untitled Note",
    open: true
  });

  if (titleInput) titleInput.value = "";
}

function collectJournalNotes() {
  return getJournalNoteRows().map(entry => ({
    id: entry.dataset.noteId,
    category: entry.querySelector(".journal-note-category")?.value.trim() || "Other",
    title: entry.querySelector(".journal-note-title")?.value.trim() || "Untitled Note",
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
  document
    .getElementById("journalNoteFilter")
    ?.addEventListener("change", applyJournalNoteFilter);

  document
    .getElementById("journalNewNoteTitle")
    ?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addJournalNoteFromToolbar();
      }
    });

  refreshJournalNoteCategoryOptions();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindJournalNotesControls);
} else {
  bindJournalNotesControls();
}
