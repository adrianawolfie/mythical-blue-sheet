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

// Reads resource text such as "2/3 Short Rest", "(4/4) Long Rest", "4 per Long Rest", or "1/PB Long Rest".
function parseFeatureResourceText(text = "") {
  const match = String(text).match(/^\s*\(?\s*(\d+)\s*(?:\/\s*(\d+|pb))?\s*\)?\s*(?:per\s+)?(.*)$/i);
  const max = match ? (match[2] ?? match[1]).toUpperCase() : "";
  return {
    max,
    type: normalizeFeatureResourceType(match ? match[3] : text),
    spent: match && /^\d+$/.test(max) ? Math.max(0, Number(max) - Number(match[1])) : 0
  };
}

function normalizeFeatureResourceType(type = "") {
  const trimmed = String(type || "").trim();
  if (/^(sr|short rest)$/i.test(trimmed)) return "Short Rest";
  if (/^(lr|long rest)$/i.test(trimmed)) return "Long Rest";
  return trimmed;
}

function setFeatureResource(entry, { max = "", type = "" }) {
  const known = type === "Short Rest" || type === "Long Rest";
  entry.querySelector(".feature-resource-area").classList.add("has-resource");
  entry.classList.add("has-resource");
  entry.querySelector(".feature-resource-max").value = max;
  entry.querySelector(".feature-resource-type").value = known ? type : "custom";
  entry.querySelector(".feature-resource-custom").value = known ? "" : type;
  entry.querySelector(".feature-resource-custom").hidden = known;
  delete entry.dataset.resourceMissing;
  renderFeatureResources();
}

// Fills feature resources that an older server dropped when saving: first from the
// character's earlier versions, then from the feat library for library feats.
async function restoreMissingFeatureResources(characterId) {
  const missing = () => getFeatureEntries().filter(entry => entry.dataset.resourceMissing === "true");
  const nameOf = entry => entry.querySelector(".feature-name")?.value.trim().toLowerCase() || "";
  let restored = 0;

  if (missing().length && characterId) {
    try {
      const history = await characterStorage.loadCharacterHistory(characterId);
      for (const version of (Array.isArray(history) ? history : []).slice(-25).reverse()) {
        if (!missing().length || currentCharacterId !== characterId) break;
        const saved = await characterStorage.loadCharacterVersion(characterId, version.versionId);
        missing().forEach(entry => {
          const feat = (saved.customLists?.feats || []).find(item =>
            String(item.name || "").trim().toLowerCase() === nameOf(entry) && (item.resourceMax || String(item.resource || "").trim())
          );
          if (!feat) return;
          setFeatureResource(entry, feat.resourceMax
            ? { max: feat.resourceMax, type: normalizeFeatureResourceType(feat.resourceType) }
            : parseFeatureResourceText(feat.resource));
          restored++;
        });
      }
    } catch (error) {
      console.warn("Could not check earlier versions for feature resources:", error);
    }
  }

  try {
    const library = (await (await fetch("data/srd-feats.json", { cache: "no-store" })).json()).feats || [];
    getFeatureEntries().forEach(entry => {
      if (entry.querySelector(".feature-resource-max").value) return;
      if (entry.querySelector(".feature-resource-area").classList.contains("has-resource") && entry.dataset.resourceMissing !== "true") return;
      const feat = library.find(item => item.resource && (item.id === entry.dataset.sourceId || item.name.toLowerCase() === nameOf(entry)));
      if (!feat || currentCharacterId !== characterId) return;
      setFeatureResource(entry, feat.resource);
      restored++;
    });
  } catch (error) {
    console.warn("Could not read the feat library for feature resources:", error);
  }

  if (restored) {
    markCharacterDirty();
    window.showToast?.(`Filled in ${restored} feature resource${restored === 1 ? "" : "s"}. Save to keep ${restored === 1 ? "it" : "them"}.`, { variant: "success", duration: 6000 });
  }
}

function addFeatureEntry(listId, data = {}) {
  const list = document.getElementById(listId);
  if (!list) return;

  const category = inferFeatureCategory(data);
  const hasResource = data.hasResource === true || Boolean(String(data.resource || "").trim());
  // Resource text such as "2/3 Short Rest" is read when the separate max and type are missing.
  const parsedResource = !data.resourceMax && String(data.resource || "").trim() ? parseFeatureResourceText(data.resource) : null;
  const resourceMax = parsedResource ? parsedResource.max : String(data.resourceMax || "");
  const resourceType = (parsedResource ? parsedResource.type : normalizeFeatureResourceType(data.resourceType)) || "Short Rest";
  const legacySpent = parsedResource ? parsedResource.spent : 0;
  const customResourceType = resourceType !== "Short Rest" && resourceType !== "Long Rest";

  const entry = document.createElement("div");
  entry.className = "feature-entry";
  entry.dataset.sourceId = String(data.sourceId || "");
  entry.dataset.source = String(data.source || "");
  entry.dataset.category = category;
  entry.dataset.resourceId = data.resourceId || crypto.randomUUID();
  if (legacySpent) entry.dataset.legacySpent = String(legacySpent);
  if (hasResource && !resourceMax && !String(data.resource || "").trim()) entry.dataset.resourceMissing = "true";

  entry.innerHTML = `
    <div class="feature-entry-head">
      <button type="button" class="feature-details-toggle" aria-expanded="${data.open ? "true" : "false"}" aria-label="Show details">
        <span class="feature-details-toggle-icon" aria-hidden="true">⌄</span>
      </button>
      <div class="feature-entry-titles">
        <input class="feature-name" type="text" placeholder="Feature name" aria-label="Feature name" value="${escapeHtml(data.name || "")}" />
        <input class="feature-short" type="text" placeholder="Short description" aria-label="Short description" value="${escapeHtml(data.short || "")}" />
      </div>
      <div class="feature-resource-area ${hasResource ? "has-resource" : ""}">
        <span class="resource-stepper">
          <button type="button" class="slot-btn" data-slot-step="-1" aria-label="Use resource">−</button>
          <output class="slot-available" aria-label="Resource available">0</output>
          <button type="button" class="slot-btn" data-slot-step="1" aria-label="Regain resource">+</button>
        </span>
        <span class="feature-resource-of">of <input class="feature-resource-max" type="text" inputmode="numeric" placeholder="max" title="A number, or PB for your proficiency bonus" aria-label="Resource max" value="${escapeHtml(resourceMax)}" /></span>
        <span class="feature-resource-recharge">
          <select class="feature-resource-type" aria-label="Resource recharge">
            <option value="Short Rest" ${resourceType === "Short Rest" ? "selected" : ""}>Short Rest</option>
            <option value="Long Rest" ${resourceType === "Long Rest" ? "selected" : ""}>Long Rest</option>
            <option value="custom" ${customResourceType ? "selected" : ""}>Custom</option>
          </select>
          <input class="feature-resource-custom" type="text" placeholder="Recharge" aria-label="Custom resource type" value="${customResourceType ? escapeHtml(resourceType) : ""}" ${customResourceType ? "" : "hidden"} />
        </span>
      </div>
    </div>

    <div class="feature-details-panel${data.open ? " is-open" : ""}" ${data.open ? "" : "hidden"}>
      <textarea class="feature-details" rows="3" placeholder="Full rules text, usage limits, recharge, source, notes…">${escapeHtml(data.details || "")}</textarea>
      <div class="feature-entry-meta">
        <label class="feature-category-control">
          <span>Category</span>
          <select class="feature-category-select" aria-label="Feature category">
            ${featureCategoryOptions(category, listId)}
          </select>
        </label>
        <button type="button" class="feature-meta-link feature-resource-toggle">+ Track uses</button>
        <button type="button" class="feature-meta-link feature-resource-remove">Stop tracking uses</button>
        <button type="button" class="feature-meta-link feature-remove">Remove feature</button>
      </div>
    </div>

    <div class="feature-edit-controls">
      <button type="button" class="feature-edit-btn feature-up" aria-label="Move up">↑</button>
      <button type="button" class="feature-edit-btn feature-down" aria-label="Move down">↓</button>
      <button type="button" class="feature-edit-btn feature-delete delete-x" aria-label="Remove feature">×</button>
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

  const detailsInput = entry.querySelector(".feature-details");

  // The rules text grows with its content instead of scrolling inside a small box.
  function fitDetails() {
    detailsInput.style.height = "auto";
    detailsInput.style.height = `${detailsInput.scrollHeight + 2}px`;
  }

  function setFeatureDetailsOpen(isOpen) {
    const open = Boolean(isOpen);
    detailsPanel.hidden = !open;
    detailsPanel.classList.toggle("is-open", open);
    entry.classList.toggle("is-open", open);
    detailsToggle.setAttribute("aria-expanded", String(open));
    detailsToggle.setAttribute("aria-label", open ? "Hide details" : "Show details");
    if (open) requestAnimationFrame(fitDetails);
  }

  setFeatureDetailsOpen(Boolean(data.open));
  detailsToggle.addEventListener("click", () => {
    setFeatureDetailsOpen(!detailsPanel.classList.contains("is-open"));
  });

  // Clicking the empty part of a row (not a field or button) opens or closes it.
  entry.querySelector(".feature-entry-head").addEventListener("click", event => {
    if (event.target.closest("input, select, button, output, .feature-resource-area")) return;
    setFeatureDetailsOpen(!detailsPanel.classList.contains("is-open"));
  });

  detailsInput.addEventListener("input", fitDetails);

  resourceToggle.addEventListener("click", () => {
    resourceArea.classList.add("has-resource");
    entry.classList.add("has-resource");
    if (!resourceInput.value.trim()) resourceInput.value = "1";
    renderFeatureResources();
    resourceInput.focus();
    resourceInput.select();
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
    entry.classList.remove("has-resource");
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

  entry.querySelectorAll(".feature-delete, .feature-remove").forEach(button => button.addEventListener("click", () => {
    const name = entry.querySelector(".feature-name")?.value.trim();
    if (!confirm(`Remove ${name || "this feature or trait"}?`)) return;
    entry.remove();
    refreshFeatureCategorySelects(listId);
    refreshFeatureView(listId);
  }));

  if (hasResource) entry.classList.add("has-resource");
  list.appendChild(entry);
  refreshFeatureCategorySelects(listId);
  refreshFeatureView(listId);
  renderFeatureResources();

  // A new blank feature opens straight away so it can be named.
  if (!data.name && !data.short && !data.details) {
    setFeatureDetailsOpen(true);
    entry.querySelector(".feature-name").focus();
  }
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
    const resourceMax = entry.querySelector(".feature-resource-max")?.value.trim() || "";
    const resourceType = entry.querySelector(".feature-resource-type")?.value === "custom"
      ? entry.querySelector(".feature-resource-custom")?.value || ""
      : entry.querySelector(".feature-resource-type")?.value || "";
    return {
      name: entry.querySelector(".feature-name")?.value || "",
      short: entry.querySelector(".feature-short")?.value || "",
      hasResource,
      // Also kept as text so servers and pages that predate resourceMax/resourceType keep the resource.
      resource: hasResource ? [resourceMax ? `${entry.querySelector(".slot-available")?.textContent || resourceMax}/${resourceMax}` : "", resourceType].filter(Boolean).join(" ") : "",
      resourceId: entry.dataset.resourceId || "",
      resourceMax: hasResource ? resourceMax : "",
      resourceType,
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
