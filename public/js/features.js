// Mythical Blue · Features and traits
// Dynamic feature / trait entries with category filters and sorting.

const DEFAULT_FEATURE_CATEGORIES = [
  "Class Feature",
  "Species Trait",
  "Origin Feat",
  "General Feat",
  "Fighting Style Feat",
  "Epic Boon Feat",
  "Other"
];

const CREATE_FEATURE_CATEGORY_VALUE = "__create_feature_category__";

function inferFeatureCategory(data = {}) {
  const explicit = String(data.category || "").trim();
  if (explicit) return explicit;

  const name = String(data.name || "").trim().toLowerCase();
  if (name.includes("class feature")) return "Class Feature";
  if (name.includes("species trait")) return "Species Trait";
  return "Other";
}

function getFeatureEntries(listId = "featList") {
  const list = document.getElementById(listId);
  return list ? Array.from(list.querySelectorAll(".feature-entry")) : [];
}

function collectKnownFeatureCategories(listId = "featList") {
  const categories = new Set(DEFAULT_FEATURE_CATEGORIES);

  getFeatureEntries(listId).forEach(entry => {
    const category = String(entry.dataset.category || "").trim();
    if (category) categories.add(category);
  });

  const extras = Array.from(categories)
    .filter(category => !DEFAULT_FEATURE_CATEGORIES.includes(category))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return [...DEFAULT_FEATURE_CATEGORIES, ...extras];
}

function featureCategoryOptions(selectedCategory = "Other", listId = "featList") {
  const categories = collectKnownFeatureCategories(listId);
  const selected = String(selectedCategory || "Other").trim() || "Other";

  if (!categories.includes(selected)) categories.push(selected);

  return categories
    .map(category => `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`)
    .join("") + `<option value="${CREATE_FEATURE_CATEGORY_VALUE}">+ Create category…</option>`;
}

function refreshFeatureCategorySelects(listId = "featList") {
  getFeatureEntries(listId).forEach(entry => {
    const select = entry.querySelector(".feature-category-select");
    if (!select) return;

    const category = String(entry.dataset.category || "Other").trim() || "Other";
    select.innerHTML = featureCategoryOptions(category, listId);
    select.value = category;
  });

  refreshFeatureFilterOptions(listId);
}

function refreshFeatureFilterOptions(listId = "featList") {
  const select = document.getElementById("featureCategoryFilter");
  if (!select) return;

  const current = select.value || "all";
  const categories = collectKnownFeatureCategories(listId);

  select.innerHTML = `<option value="all">All categories</option>${categories
    .map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;

  select.value = categories.includes(current) ? current : "all";
}

function refreshFeatureView(listId = "featList") {
  const entries = getFeatureEntries(listId);
  const query = String(document.getElementById("featureSearchInput")?.value || "")
    .trim()
    .toLowerCase();
  const categoryFilter = document.getElementById("featureCategoryFilter")?.value || "all";
  const sortMode = document.getElementById("featureSortSelect")?.value || "manual";

  const visibleEntries = entries.filter(entry => {
    const name = String(entry.querySelector(".feature-name")?.value || "").toLowerCase();
    const short = String(entry.querySelector(".feature-short")?.value || "").toLowerCase();
    const category = String(entry.dataset.category || "Other");
    const matchesSearch = !query || `${name} ${short}`.includes(query);
    const matchesCategory = categoryFilter === "all" || category === categoryFilter;
    const visible = matchesSearch && matchesCategory;
    entry.hidden = !visible;
    return visible;
  });

  const sorters = {
    nameAsc: (a, b) => String(a.querySelector(".feature-name")?.value || "").localeCompare(String(b.querySelector(".feature-name")?.value || ""), undefined, { sensitivity: "base" }),
    nameDesc: (a, b) => String(b.querySelector(".feature-name")?.value || "").localeCompare(String(a.querySelector(".feature-name")?.value || ""), undefined, { sensitivity: "base" }),
    categoryAsc: (a, b) => {
      const categoryCompare = String(a.dataset.category || "Other").localeCompare(String(b.dataset.category || "Other"), undefined, { sensitivity: "base" });
      if (categoryCompare) return categoryCompare;
      return String(a.querySelector(".feature-name")?.value || "").localeCompare(String(b.querySelector(".feature-name")?.value || ""), undefined, { sensitivity: "base" });
    }
  };

  const displayOrder = sorters[sortMode] ? [...entries].sort(sorters[sortMode]) : entries;
  displayOrder.forEach((entry, index) => { entry.style.order = String(index); });

  const count = document.getElementById("featureFilterCount");
  if (count) count.textContent = `${visibleEntries.length} of ${entries.length} feature${entries.length === 1 ? "" : "s"}`;
}

function clearFeatureFilters(listId = "featList") {
  const search = document.getElementById("featureSearchInput");
  const category = document.getElementById("featureCategoryFilter");
  const sort = document.getElementById("featureSortSelect");

  if (search) search.value = "";
  if (category) category.value = "all";
  if (sort) sort.value = "manual";

  refreshFeatureView(listId);
}

function initFeatureBrowserControls(listId = "featList") {
  const search = document.getElementById("featureSearchInput");
  const category = document.getElementById("featureCategoryFilter");
  const sort = document.getElementById("featureSortSelect");
  const clear = document.getElementById("featureClearFiltersBtn");

  search?.addEventListener("input", () => refreshFeatureView(listId));
  category?.addEventListener("change", () => refreshFeatureView(listId));
  sort?.addEventListener("change", () => refreshFeatureView(listId));
  clear?.addEventListener("click", () => clearFeatureFilters(listId));
}

function assignFeatureCategory(entry, category, listId = "featList") {
  const normalized = String(category || "Other").trim() || "Other";
  entry.dataset.category = normalized;
  refreshFeatureCategorySelects(listId);
  refreshFeatureView(listId);
}

function promptForFeatureCategory(entry, listId = "featList") {
  const category = prompt("Create a category for this feature or trait:", "")?.trim();
  if (!category) {
    refreshFeatureCategorySelects(listId);
    return;
  }
  assignFeatureCategory(entry, category, listId);
}

function addFeatureEntry(listId, data = {}) {
  const list = document.getElementById(listId);
  if (!list) return;

  const category = inferFeatureCategory(data);
  const hasResource = data.hasResource === true || Boolean(String(data.resource || "").trim());
  let resourceMax = String(data.resourceMax || "");
  let resourceType = data.resourceType || "Short Rest";
  let legacySpent = 0;

  // Split legacy resource text such as "2/3 Short Rest" into max, type, and spent.
  if (!resourceMax && String(data.resource || "").trim()) {
    const legacy = String(data.resource).match(/^\s*\(?\s*(\d+)\s*(?:\/\s*(\d+))?\s*\)?\s*(?:per\s+)?(.*)$/i);
    resourceMax = legacy ? (legacy[2] ?? legacy[1]) : "";
    resourceType = (legacy ? legacy[3] : data.resource).trim();
    if (legacy) legacySpent = Math.max(0, Number(resourceMax) - Number(legacy[1]));
  }
  if (/^(sr|short rest)$/i.test(resourceType)) resourceType = "Short Rest";
  if (/^(lr|long rest)$/i.test(resourceType)) resourceType = "Long Rest";
  const customResourceType = resourceType !== "Short Rest" && resourceType !== "Long Rest";

  const entry = document.createElement("div");
  entry.className = "feature-entry";
  entry.dataset.sourceId = String(data.sourceId || "");
  entry.dataset.source = String(data.source || "");
  entry.dataset.category = category;
  entry.dataset.resourceId = data.resourceId || crypto.randomUUID();
  if (legacySpent) entry.dataset.legacySpent = String(legacySpent);

  entry.innerHTML = `
    <div class="feature-entry-top">
      <input class="feature-name" type="text" placeholder="Name" value="${escapeHtml(data.name || "")}" />
      <input class="feature-short" type="text" placeholder="Short description" value="${escapeHtml(data.short || "")}" />
    </div>

    <div class="feature-entry-footer">
      <button type="button" class="feature-details-toggle" aria-expanded="${data.open ? "true" : "false"}">
        <span class="feature-details-toggle-icon" aria-hidden="true">${data.open ? "▾" : "▸"}</span>
        <span>Details</span>
      </button>

      <label class="feature-category-control">
        <span class="feature-category-label">Category</span>
        <select class="feature-category-select" aria-label="Feature category">
          ${featureCategoryOptions(category, listId)}
        </select>
      </label>

      <div class="feature-resource-area ${hasResource ? "has-resource" : ""}">
        <button type="button" class="feature-resource-toggle">+ Add Resource</button>
        <div class="feature-resource-box">
          <label>Resource</label>
          <div class="slot-row">
            <button type="button" class="slot-btn" data-slot-step="-1" aria-label="Use resource">−</button>
            <output class="slot-available" aria-label="Resource available">0</output>
            <button type="button" class="slot-btn" data-slot-step="1" aria-label="Regain resource">+</button>
            /
            <input class="feature-resource-max" type="text" inputmode="numeric" placeholder="max" aria-label="Resource max" value="${escapeHtml(resourceMax)}" />
          </div>
          <select class="feature-resource-type" aria-label="Resource recharge">
            <option value="Short Rest" ${resourceType === "Short Rest" ? "selected" : ""}>Short Rest</option>
            <option value="Long Rest" ${resourceType === "Long Rest" ? "selected" : ""}>Long Rest</option>
            <option value="custom" ${customResourceType ? "selected" : ""}>Custom</option>
          </select>
          <input class="feature-resource-custom" type="text" placeholder="Resource type" aria-label="Custom resource type" value="${customResourceType ? escapeHtml(resourceType) : ""}" ${customResourceType ? "" : "hidden"} />
          <button type="button" class="feature-resource-remove" aria-label="Remove resource tracker">X</button>
        </div>
      </div>

      <div class="feature-details-panel${data.open ? " is-open" : ""}" ${data.open ? "" : "hidden"}>
        <textarea class="feature-details" placeholder="Full rules text, usage limits, recharge, source, notes...">${escapeHtml(data.details || "")}</textarea>
      </div>
    </div>

    <div class="feature-edit-controls">
      <button type="button" class="feature-edit-btn feature-up">↑</button>
      <button type="button" class="feature-edit-btn feature-down">↓</button>
      <button type="button" class="feature-edit-btn feature-delete delete-x">X</button>
    </div>
  `;

  const resourceArea = entry.querySelector(".feature-resource-area");
  const resourceToggle = entry.querySelector(".feature-resource-toggle");
  const resourceInput = entry.querySelector(".feature-resource-max");
  const resourceTypeSelect = entry.querySelector(".feature-resource-type");
  const resourceCustomInput = entry.querySelector(".feature-resource-custom");
  const resourceRemove = entry.querySelector(".feature-resource-remove");
  const categorySelect = entry.querySelector(".feature-category-select");
  const detailsToggle = entry.querySelector(".feature-details-toggle");
  const detailsPanel = entry.querySelector(".feature-details-panel");
  const detailsToggleIcon = entry.querySelector(".feature-details-toggle-icon");

  function setFeatureDetailsOpen(isOpen) {
    const open = Boolean(isOpen);
    detailsPanel.hidden = !open;
    detailsPanel.classList.toggle("is-open", open);
    detailsToggle.setAttribute("aria-expanded", String(open));
    if (detailsToggleIcon) detailsToggleIcon.textContent = open ? "▾" : "▸";
  }

  detailsToggle.addEventListener("click", () => {
    setFeatureDetailsOpen(!detailsPanel.classList.contains("is-open"));
  });

  resourceToggle.addEventListener("click", () => {
    resourceArea.classList.add("has-resource");
    resourceInput.focus();
  });

  resourceTypeSelect.addEventListener("change", () => {
    resourceCustomInput.hidden = resourceTypeSelect.value !== "custom";
    if (!resourceCustomInput.hidden) resourceCustomInput.focus();
  });

  resourceInput.addEventListener("input", () => renderFeatureResources());

  resourceRemove.addEventListener("click", () => {
    if (!confirm("Remove the resource tracker from this feature or trait?")) return;
    resourceInput.value = "";
    resourceArea.classList.remove("has-resource");
    const { [entry.dataset.resourceId]: removed, ...remaining } = featureResourcesSpent;
    featureResourcesSpent = remaining;
    renderFeatureResources();
    scheduleHPAutoSave({ featureResourcesSpent });
  });

  categorySelect.addEventListener("change", () => {
    if (categorySelect.value === CREATE_FEATURE_CATEGORY_VALUE) {
      promptForFeatureCategory(entry, listId);
      return;
    }
    assignFeatureCategory(entry, categorySelect.value, listId);
  });

  entry.querySelectorAll(".feature-name, .feature-short, .feature-details").forEach(field => {
    field.addEventListener("input", () => refreshFeatureView(listId));
  });

  entry.querySelector(".feature-up").addEventListener("click", () => {
    const previous = entry.previousElementSibling;
    if (previous) list.insertBefore(entry, previous);
    const sort = document.getElementById("featureSortSelect");
    if (sort) sort.value = "manual";
    refreshFeatureView(listId);
  });

  entry.querySelector(".feature-down").addEventListener("click", () => {
    const next = entry.nextElementSibling;
    if (next) list.insertBefore(next, entry);
    const sort = document.getElementById("featureSortSelect");
    if (sort) sort.value = "manual";
    refreshFeatureView(listId);
  });

  entry.querySelector(".feature-delete").addEventListener("click", () => {
    if (!confirm("Remove this feature or trait?")) return;
    entry.remove();
    refreshFeatureCategorySelects(listId);
    refreshFeatureView(listId);
  });

  list.appendChild(entry);
  refreshFeatureCategorySelects(listId);
  refreshFeatureView(listId);
  renderFeatureResources();
}

function toggleFeatureEditMode(listId, button) {
  const list = document.getElementById(listId);
  if (!list) return;
  const isEditing = list.classList.toggle("editing");
  if (button) button.classList.toggle("editing-active", isEditing);
}

function collectFeatureEntries(listId) {
  return getFeatureEntries(listId).map(entry => {
    const resourceArea = entry.querySelector(".feature-resource-area");
    const hasResource = resourceArea?.classList.contains("has-resource") || false;
    return {
      name: entry.querySelector(".feature-name")?.value || "",
      short: entry.querySelector(".feature-short")?.value || "",
      hasResource,
      resource: "",
      resourceId: entry.dataset.resourceId || "",
      resourceMax: hasResource ? entry.querySelector(".feature-resource-max")?.value || "" : "",
      resourceType: entry.querySelector(".feature-resource-type")?.value === "custom"
        ? entry.querySelector(".feature-resource-custom")?.value || ""
        : entry.querySelector(".feature-resource-type")?.value || "",
      details: entry.querySelector(".feature-details")?.value || "",
      open: entry.querySelector(".feature-details-panel")?.classList.contains("is-open") || false,
      sourceId: entry.dataset.sourceId || "",
      source: entry.dataset.source || "",
      category: entry.dataset.category || "Other"
    };
  });
}

function renderFeatureEntries(listId, entries = []) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = "";

  if (!entries.length) {
    addFeatureEntry(listId, { name: "Class Feature", category: "Class Feature", short: "Short summary of what this feature does.", hasResource: true, resourceMax: "1", resourceType: "Short Rest", details: "" });
    addFeatureEntry(listId, { name: "Species Trait", category: "Species Trait", short: "Short summary of what this trait does.", details: "" });
    addFeatureEntry(listId, { name: "Feat", category: "Other", short: "Short summary of what this feat does.", details: "" });
    return;
  }

  // Legacy entries without a resource ID get an index-based ID that becomes stable on the next save.
  entries.forEach((entry, index) => addFeatureEntry(listId, { ...entry, resourceId: entry.resourceId || `feat-${index}` }));
  refreshFeatureCategorySelects(listId);
  refreshFeatureView(listId);
}

document.addEventListener("DOMContentLoaded", () => {
  initFeatureBrowserControls("featList");
  refreshFeatureCategorySelects("featList");
  refreshFeatureView("featList");
});
