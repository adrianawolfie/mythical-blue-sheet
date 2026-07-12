// Mythical Blue · Armor Class modifiers
// Base AC, adjustable modifiers, active toggles, and calculated total.

const ARMOR_CLASS_PRESETS = {
  "mage-armor": {
    name: "Mage Armor",
    value: "3"
  },
  shield: {
    name: "Shield",
    value: "2"
  },
  custom: {
    name: "Modifier",
    value: "0"
  }
};

function setArmorClassPanelOpen(isOpen) {
  const panel = document.getElementById("armorClassPanel");
  const toggle = document.getElementById("toggleArmorClassPanelBtn");

  if (!panel || !toggle) return;

  panel.hidden = !isOpen;
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.textContent = isOpen ? "− Close AC" : "+ Modify AC";
}

function toggleArmorClassPanel() {
  const panel = document.getElementById("armorClassPanel");
  if (!panel) return;

  setArmorClassPanelOpen(panel.hidden);
}

function createArmorClassModifierRow(data = {}) {
  const rows = document.getElementById("armorClassModifierRows");
  if (!rows) return;

  const row = document.createElement("div");
  row.className = "armor-class-modifier-row";

  const modifierName = String(data.name || "Modifier");
  const modifierValue = String(data.value ?? "0");
  const isActive = data.active !== false;

  row.innerHTML = `
    <label class="armor-class-active" title="Toggle modifier active or inactive">
      <input
        class="armor-class-active-input"
        type="checkbox"
        ${isActive ? "checked" : ""}
        aria-label="Toggle ${escapeHtml(modifierName)} active"
      >
      <span class="armor-class-active-mark" aria-hidden="true">✓</span>
    </label>

    <input
      class="armor-class-modifier-name"
      type="text"
      value="${escapeHtml(modifierName)}"
      aria-label="Armor Class modifier name"
    >

    <input
      class="armor-class-modifier-value"
      type="text"
      inputmode="numeric"
      value="${escapeHtml(modifierValue)}"
      aria-label="${escapeHtml(modifierName)} Armor Class modifier"
    >

    <button
      type="button"
      class="armor-class-modifier-remove"
      title="Remove Armor Class modifier"
      aria-label="Remove ${escapeHtml(modifierName)} Armor Class modifier"
    >×</button>
  `;

  row.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => {
      updateArmorClassTotal({ scheduleSave: true });
    });

    input.addEventListener("change", () => {
      updateArmorClassTotal({ scheduleSave: true });
    });
  });

  row
    .querySelector(".armor-class-modifier-remove")
    .addEventListener("click", () => {
      row.remove();
      updateArmorClassTotal({ scheduleSave: true });
    });

  rows.appendChild(row);
}

function addArmorClassModifier(presetKey) {
  const preset = ARMOR_CLASS_PRESETS[presetKey];
  if (!preset) return;

  createArmorClassModifierRow({
    ...preset,
    active: true
  });

  updateArmorClassTotal({ scheduleSave: true });
}

function collectArmorClassState() {
  const base = document.getElementById("armorClassBaseInput")?.value.trim() || "";

  const modifiers = Array.from(
    document.querySelectorAll(".armor-class-modifier-row")
  ).map(row => ({
    name:
      row.querySelector(".armor-class-modifier-name")?.value.trim() ||
      "Modifier",
    value:
      row.querySelector(".armor-class-modifier-value")?.value.trim() ||
      "0",
    active:
      row.querySelector(".armor-class-active-input")?.checked === true
  }));

  return {
    base,
    modifiers
  };
}

function calculateArmorClassTotal(state = collectArmorClassState()) {
  const rawBase = String(state?.base ?? "").trim();

  if (!rawBase) return "";

  const base = Number(rawBase);

  if (!Number.isFinite(base)) return "";

  const modifierTotal = (state.modifiers || []).reduce((total, modifier) => {
    if (modifier.active === false) return total;

    const value = Number(modifier.value);
    return Number.isFinite(value) ? total + value : total;
  }, 0);

  return String(base + modifierTotal);
}

function updateArmorClassTotal({ scheduleSave = false } = {}) {
  const totalInput = document.getElementById("armorClassInput");
  if (!totalInput) return;

  totalInput.value = calculateArmorClassTotal();

  if (scheduleSave) {
    scheduleHPAutoSave();
  }
}

function renderArmorClassState(
  state = null,
  fallbackBase = "",
  { scheduleSave = false } = {}
) {
  const baseInput = document.getElementById("armorClassBaseInput");
  const rows = document.getElementById("armorClassModifierRows");

  if (!baseInput || !rows) return;

  const normalizedState =
    state && typeof state === "object"
      ? state
      : {
          base: fallbackBase,
          modifiers: []
        };

  baseInput.value = normalizedState.base ?? fallbackBase ?? "";
  rows.innerHTML = "";

  (Array.isArray(normalizedState.modifiers)
    ? normalizedState.modifiers
    : []
  ).forEach(modifier => {
    createArmorClassModifierRow(modifier);
  });

  updateArmorClassTotal({ scheduleSave });
}

function bindArmorClassControls() {
  const toggle = document.getElementById("toggleArmorClassPanelBtn");
  const closeButton = document.getElementById("closeArmorClassPanelBtn");
  const panel = document.getElementById("armorClassPanel");
  const tracker = document.querySelector(".armor-class-tracker");
  const baseInput = document.getElementById("armorClassBaseInput");
  const addSelect = document.getElementById("addArmorClassModifierSelect");

  toggle?.addEventListener("click", toggleArmorClassPanel);
  closeButton?.addEventListener("click", () => {
    setArmorClassPanelOpen(false);
  });

  document.addEventListener("click", event => {
    if (!panel || panel.hidden || !tracker) return;
    if (!tracker.contains(event.target)) {
      setArmorClassPanelOpen(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel && !panel.hidden) {
      setArmorClassPanelOpen(false);
      toggle?.focus();
    }
  });

  baseInput?.addEventListener("input", () => {
    updateArmorClassTotal({ scheduleSave: true });
  });

  addSelect?.addEventListener("change", () => {
    if (!addSelect.value) return;

    addArmorClassModifier(addSelect.value);
    addSelect.value = "";
  });
}
