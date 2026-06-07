// Mythical Blue · Features and traits
// Dynamic feature and trait entries.

function addFeatureEntry(listId, data = {}) {
  const list = document.getElementById(listId);
  if (!list) return;

  const hasResource =
    data.hasResource === true ||
    Boolean(String(data.resource || "").trim());

  const entry = document.createElement("div");
  entry.className = "feature-entry";

  entry.innerHTML = `
    <div class="feature-entry-top">
      <input class="feature-name" type="text" placeholder="Name" value="${escapeHtml(data.name || "")}" />
      <input class="feature-short" type="text" placeholder="Short description" value="${escapeHtml(data.short || "")}" />
    </div>

    <div class="feature-meta-row">
      <details ${data.open ? "open" : ""}>
        <summary>Details</summary>
        <textarea class="feature-details" placeholder="Full rules text, usage limits, recharge, source, notes...">${escapeHtml(data.details || "")}</textarea>
      </details>

      <div class="feature-resource-area ${hasResource ? "has-resource" : ""}">
        <button type="button" class="feature-resource-toggle">
          + Add Resource
        </button>

        <div class="feature-resource-box">
          <label>Resource</label>
          <input class="feature-resource" type="text" placeholder="2/3 Short Rest" value="${escapeHtml(data.resource || "")}" />
          <button type="button" class="feature-resource-remove" aria-label="Remove resource tracker">X</button>
        </div>
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
  const resourceInput = entry.querySelector(".feature-resource");
  const resourceRemove = entry.querySelector(".feature-resource-remove");

  resourceToggle.addEventListener("click", () => {
    resourceArea.classList.add("has-resource");
    resourceInput.focus();
  });

  resourceRemove.addEventListener("click", () => {
    const shouldRemove = confirm(
      "Remove the resource tracker from this feature or trait?"
    );

    if (!shouldRemove) return;

    resourceInput.value = "";
    resourceArea.classList.remove("has-resource");
  });

  entry.querySelector(".feature-up").addEventListener("click", () => {
    const previous = entry.previousElementSibling;
    if (previous) {
      list.insertBefore(entry, previous);
    }
  });

  entry.querySelector(".feature-down").addEventListener("click", () => {
    const next = entry.nextElementSibling;
    if (next) {
      list.insertBefore(next, entry);
    }
  });

  entry.querySelector(".feature-delete").addEventListener("click", () => {
    if (confirm("Remove this feature or trait?")) {
      entry.remove();
    }
  });

  list.appendChild(entry);
}
function toggleFeatureEditMode(listId, button) {
  const list = document.getElementById(listId);
  if (!list) return;

  const isEditing = list.classList.toggle("editing");
  if (button) {
    button.classList.toggle("editing-active", isEditing);
  }
}
function collectFeatureEntries(listId) {
  const list = document.getElementById(listId);
  if (!list) return [];

return Array.from(list.querySelectorAll(".feature-entry")).map(entry => {
  const resourceArea = entry.querySelector(".feature-resource-area");
  const hasResource = resourceArea?.classList.contains("has-resource") || false;

  return {
    name: entry.querySelector(".feature-name")?.value || "",
    short: entry.querySelector(".feature-short")?.value || "",
    hasResource,
    resource: hasResource
      ? entry.querySelector(".feature-resource")?.value || ""
      : "",
    details: entry.querySelector(".feature-details")?.value || "",
    open: entry.querySelector("details")?.open || false
  };
});
}

function renderFeatureEntries(listId, entries = []) {
  const list = document.getElementById(listId);
  if (!list) return;

  list.innerHTML = "";

if (!entries.length) {
addFeatureEntry(listId, {
  name: "Class Feature",
  short: "Short summary of what this feature does.",
  resource: "1/1 Short Rest",
  details: ""
});
  addFeatureEntry(listId, {
    name: "Species Trait",
    short: "Short summary of what this trait does.",
    details: ""
  });
  addFeatureEntry(listId, {
    name: "Feat",
    short: "Short summary of what this feat does.",
    details: ""
  });
  return;
}

  entries.forEach(entry => addFeatureEntry(listId, entry));
}
