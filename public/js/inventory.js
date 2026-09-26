// Mythical Blue · Inventory page
// Structured items, storage locations, mirrored coinage, equipped slots, and filters.

const DEFAULT_INVENTORY_EQUIPMENT_ROWS = [];
const DEFAULT_INVENTORY_MAGIC_ITEM_ROWS = [];
const DEFAULT_INVENTORY_CONSUMABLE_ROWS = [];
const DEFAULT_UNIFIED_INVENTORY_ROWS = [];
const DEFAULT_INVENTORY_GEM_ROWS = [];
const DEFAULT_STORAGE_LOCATION_ROWS = [];
const DEFAULT_INVENTORY_ATTUNEMENT_ROWS = [
  { item: "", notes: "" },
  { item: "", notes: "" },
  { item: "", notes: "" }
];

const EQUIPPED_SLOT_DEFINITIONS = [
  { key: "head", label: "Head" },
  { key: "neck", label: "Neck" },
  { key: "cape", label: "Cape" },
  { key: "armor", label: "Armor" },
  { key: "clothing", label: "Clothing" },
  { key: "mainHand", label: "Main Hand" },
  { key: "offHand", label: "Off Hand" },
  { key: "ring1", label: "Ring 1" },
  { key: "ring2", label: "Ring 2" },
  { key: "belt", label: "Belt / Quick Access" },
  { key: "glovesBracers", label: "Gloves / Bracers" },
  { key: "footwear", label: "Footwear" },
  { key: "backStorage", label: "Backpack / Carried Storage" },
  { key: "otherWorn", label: "Other Worn Item" }
];


const INVENTORY_ITEM_TYPE_OPTIONS = [
  { value: "gear", label: "Gear" },
  { value: "tool", label: "Tool" },
  { value: "magic", label: "Magic Item" },
  { value: "consumable", label: "Potion / Consumable" },
  { value: "other", label: "Other" }
];

const INVENTORY_RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];

function normalizeInventoryRarity(rarity = "") {
  const key = String(rarity || "").trim().toLowerCase();
  return INVENTORY_RARITIES.find(option => option.toLowerCase() === key) || "";
}

function inventoryRarityKey(rarity = "") {
  return normalizeInventoryRarity(rarity).toLowerCase().replace(/\s+/g, "-");
}

// Library magic items used to store their rarity as the value, and their descriptions start
// with a line such as "Magic Item · Rare", so rarity can be recovered when it is not stored.
function inferInventoryRarity(data = {}) {
  const firstLine = String(data.details || "").split("\n")[0];
  return normalizeInventoryRarity(data.rarity) ||
    normalizeInventoryRarity(data.value) ||
    [...INVENTORY_RARITIES].sort((a, b) => b.length - a.length).find(rarity => new RegExp(`\\b${rarity}\\b`).test(firstLine)) ||
    "";
}

function inventoryRarityOptions(selected = "") {
  return `<option value="">—</option>${INVENTORY_RARITIES
    .map(rarity => `<option value="${rarity}"${rarity === selected ? " selected" : ""}>${rarity}</option>`)
    .join("")}`;
}

// Items whose description mentions attunement (library items say "Requires Attunement"),
// and magic items without a description yet, can be attuned from the equipment list.
// Players mark items that need attunement with the "Requires attunement" checkbox, which
// keeps a "Requires Attunement" note in the item's details (library items already have one).
function canAttuneInventoryItem(row) {
  return row.querySelector(".inventory-item-requires-attunement")?.checked === true;
}

function setRequiresAttunementNote(details, required) {
  const text = details.value;
  if (required && !/requires attunement/i.test(text)) {
    details.value = text.trim() ? `Requires Attunement\n\n${text}` : "Requires Attunement";
  } else if (!required) {
    details.value = text
      .replace(/\s*·\s*Requires Attunement[^·\n]*/gi, "")
      .replace(/^\s*\(?Requires Attunement[^\n]*\n*/gim, "")
      .trim();
  }
}

function attunedItemNames() {
  return Array.from(document.querySelectorAll("#inventoryAttunementBody .inventory-attunement-item"))
    .map(input => input.value.trim().toLowerCase())
    .filter(Boolean);
}

// Shows which items are attuned and hides the attune button for items that cannot be attuned.
// Shows the attune button on items that require attunement (or are attuned) and marks attuned items.
function refreshAttunementButtons() {
  const attuned = attunedItemNames();
  document.querySelectorAll("#inventoryItemsBody .inventory-entry").forEach(row => {
    const name = row.querySelector(".inventory-item-name")?.value.trim() || "";
    const isAttuned = Boolean(name) && attuned.includes(name.toLowerCase());
    const button = row.querySelector(".inventory-attune-toggle");
    row.dataset.attuned = String(isAttuned);
    if (!button) return;
    button.hidden = !isAttuned && !canAttuneInventoryItem(row);
    button.classList.toggle("is-attuned", isAttuned);
    button.setAttribute("aria-pressed", String(isAttuned));
    button.innerHTML = isAttuned ? '<span aria-hidden="true">✦</span> Attuned' : '<span aria-hidden="true">✧</span> Attune';
    button.title = isAttuned ? "Attuned. Click to end attunement." : "Add to an attunement slot";
  });
}

// Adds an item to the first empty attunement slot, or frees its slot when it is already attuned.
function toggleItemAttunement(row) {
  const name = row.querySelector(".inventory-item-name")?.value.trim() || "";
  if (!name) {
    window.showToast?.("Give the item a name before attuning to it.", { variant: "error" });
    return;
  }

  const slots = Array.from(document.querySelectorAll("#inventoryAttunementBody .inventory-attunement-item"));
  const current = slots.find(input => input.value.trim().toLowerCase() === name.toLowerCase());

  if (current) {
    current.value = "";
  } else {
    const empty = slots.find(input => !input.value.trim());
    if (!empty) {
      window.showToast?.("All attunement slots are full. Remove an attuned item first.", { variant: "error" });
      return;
    }
    empty.value = name;
  }

  markCharacterDirty();
  refreshAttunementButtons();
}

const inventorySortState = {
  key: "name",
  direction: "asc"
};

function inventoryItemRowPairs(body = document.getElementById("inventoryItemsBody")) {
  if (!body) return [];

  return Array.from(body.querySelectorAll(".inventory-entry")).map(row => ({
    row,
    type: normalizeInventoryType(row.querySelector(".inventory-item-type")?.value || "gear")
  }));
}

function inventorySortValue(row, key = "name") {
  if (!row) return "";

  if (key === "type") {
    return inventoryTypeLabel(
      row.querySelector(".inventory-item-type")?.value || "gear"
    ).toLocaleLowerCase();
  }

  if (key === "rarity") {
    const rank = INVENTORY_RARITIES.indexOf(normalizeInventoryRarity(row.querySelector(".inventory-item-rarity")?.value));
    return String(rank < 0 ? 9 : rank);
  }

  if (key === "location") {
    return (
      row.querySelector(".inventory-location")?.selectedOptions?.[0]?.textContent ||
      "Unassigned"
    ).trim().toLocaleLowerCase();
  }

  return (row.querySelector(".inventory-item-name")?.value || "")
    .trim()
    .toLocaleLowerCase();
}

function updateInventorySortHeaders() {
  document.querySelectorAll("[data-inventory-sort-key]").forEach(button => {
    const key = button.dataset.inventorySortKey || "";
    const active = inventorySortState.key === key;
    const indicator = button.querySelector(".inventory-sort-indicator");
    const th = button.closest("th");

    button.classList.toggle("is-active", active);
    if (indicator) {
      indicator.textContent = active
        ? (inventorySortState.direction === "asc" ? "▲" : "▼")
        : "↕";
    }
    th?.setAttribute(
      "aria-sort",
      active
        ? (inventorySortState.direction === "asc" ? "ascending" : "descending")
        : "none"
    );
  });

  updateInventoryMobileSortControls();
}

function updateInventoryMobileSortControls() {
  const select = document.getElementById("inventoryMobileSortSelect");
  const directionButton = document.getElementById("inventoryMobileSortDirection");
  const key = inventorySortState.key || "name";
  const direction = inventorySortState.direction === "desc" ? "desc" : "asc";

  if (select && ["name", "type", "rarity", "location"].includes(key)) {
    select.value = key;
  }

  if (directionButton) {
    const ascending = direction === "asc";
    directionButton.textContent = ascending ? "A–Z ↑" : "Z–A ↓";
    directionButton.setAttribute(
      "aria-label",
      ascending ? "Reverse equipment sort order to descending" : "Reverse equipment sort order to ascending"
    );
  }
}

function applyInventorySort() {
  const body = document.getElementById("inventoryItemsBody");
  if (!body) return;

  const pairs = inventoryItemRowPairs(body);
  const { key, direction } = inventorySortState;

  if (key) {
    pairs.sort((a, b) => {
      const comparison = inventorySortValue(a.row, key).localeCompare(
        inventorySortValue(b.row, key),
        undefined,
        { sensitivity: "base", numeric: true }
      );

      return direction === "desc" ? -comparison : comparison;
    });
  }

  pairs.forEach(pair => body.appendChild(pair.row));

  updateInventorySortHeaders();
  applyInventoryFilters();
}

function sortInventoryItems(key = "name") {
  if (!['name', 'type', 'rarity', 'location'].includes(key)) return;

  if (inventorySortState.key === key) {
    inventorySortState.direction = inventorySortState.direction === "asc"
      ? "desc"
      : "asc";
  } else {
    inventorySortState.key = key;
    inventorySortState.direction = "asc";
  }

  applyInventorySort();
}


// Refreshes an item's one-line summary: name, type · rarity · location, quantity, and value.
function updateInventoryItemSummary(row) {
  if (!row) return;

  const name = row.querySelector(".inventory-item-name")?.value.trim() || "New item";
  const qty = row.querySelector(".inventory-item-qty")?.value.trim() || "";
  const value = row.querySelector(".inventory-item-value")?.value.trim() || "";
  const type = inventoryTypeLabel(row.querySelector(".inventory-item-type")?.value || "gear");
  const rarity = normalizeInventoryRarity(row.querySelector(".inventory-item-rarity")?.value);
  const location = row.querySelector(".inventory-location")?.selectedOptions?.[0]?.textContent?.trim() || "Unassigned";

  row.dataset.rarity = inventoryRarityKey(rarity);
  row.querySelector(".inventory-entry-name").textContent = name;
  row.querySelector(".inventory-entry-meta").textContent = [type, rarity, location].filter(Boolean).join(" · ");
  row.querySelector(".inventory-entry-qty").textContent = qty && qty !== "1" ? `×${qty}` : "";
  row.querySelector(".inventory-entry-value").textContent = value;
}

function updateAllInventoryItemSummaries() {
  document
    .querySelectorAll("#inventoryItemsBody .inventory-entry")
    .forEach(updateInventoryItemSummary);
}

const STANDARD_ITEM_LOCATIONS = [
  { value: "", label: "Unassigned" },
  { value: "worn", label: "Equipped & Carried" }
];


const SILHOUETTE_VIEW_DEFAULT = "list";

const EQUIPPED_SILHOUETTE_COLUMNS = {
  left: ["head", "cape", "armor", "mainHand", "glovesBracers", "ring1", "footwear"],
  right: ["neck", "clothing", "offHand", "belt", "backStorage", "ring2", "otherWorn"]
};

const EQUIPPED_SLOT_ICON_MAP = {
  head: "assets/equipment-icons/head-hood.png",
  neck: "assets/equipment-icons/necklace.svg",
  cape: "assets/equipment-icons/cape.png",
  armor: "assets/equipment-icons/armor.png",
  clothing: "assets/equipment-icons/clothing.png",
  mainHand: "assets/equipment-icons/main-hand.png",
  offHand: "assets/equipment-icons/off-hand.png",
  ring1: "assets/equipment-icons/ring.svg",
  ring2: "assets/equipment-icons/ring.svg",
  belt: "assets/equipment-icons/belt.png",
  glovesBracers: "assets/equipment-icons/gloves-bracers.png",
  footwear: "assets/equipment-icons/boots.png",
  backStorage: "assets/equipment-icons/backpack.png",
  otherWorn: "assets/equipment-icons/other-worn-gem.svg"
};

const CUSTOM_SLOT_NODE_HINTS = [
  { pattern: /glove|bracer|gauntlet/i, slot: "glovesBracers" },
  { pattern: /boot|shoe|greave/i, slot: "footwear" },
  { pattern: /backpack|satchel|bag|pouch|quiver|pack/i, slot: "backStorage" },
  { pattern: /cloak|cape|mantle/i, slot: "cape" },
  { pattern: /ring/i, slot: "ring2" },
  { pattern: /helmet|hood|circlet|hat/i, slot: "head" },
  { pattern: /amulet|necklace|pendant/i, slot: "neck" },
  { pattern: /belt/i, slot: "belt" },
  { pattern: /weapon|sword|staff|wand|bow|axe|hammer/i, slot: "mainHand" },
  { pattern: /shield|focus|orb|lantern/i, slot: "offHand" }
];

let currentEquippedSlotsState = Object.fromEntries(
  EQUIPPED_SLOT_DEFINITIONS.map(slot => [slot.key, ""])
);

function getInventoryView() {
  return "list";
}

function setInventoryView(view = SILHOUETTE_VIEW_DEFAULT) {
  const layout = document.getElementById("equippedLayout");
  if (!layout) return;

  layout.dataset.view = "list";
  layout.classList.add("is-list-view", "equipped-list-only");
  layout.classList.remove("is-silhouette-view");

  renderEquippedActiveView();
}

function bindInventoryViewToggle() {
  // List-only view: toggle removed intentionally.
}

function getSelectedOptionLabel(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

function findEquippedSlotDefinition(slotKey) {
  return EQUIPPED_SLOT_DEFINITIONS.find(slot => slot.key === slotKey);
}

function createEquippedSlotCard(slot, value = "") {
  const iconSrc = EQUIPPED_SLOT_ICON_MAP[slot.key] || EQUIPPED_SLOT_ICON_MAP.otherWorn;
  return `
    <label class="equipped-slot-card${value ? " is-active" : ""}" data-slot-key="${inventorySafeValue(slot.key)}">
      <span class="equipped-slot-icon-wrap">
        <img class="equipped-slot-icon" src="${inventorySafeValue(iconSrc)}" alt="" aria-hidden="true">
      </span>
      <span class="equipped-slot-content">
        <span class="equipped-slot-label">${inventorySafeValue(slot.label)}</span>
        <select
          class="equipped-slot-select"
          data-equipped-slot="${inventorySafeValue(slot.key)}"
          data-selected-item-id="${inventorySafeValue(value || "")}"
        ></select>
      </span>
    </label>
  `;
}

function bindEquippedSlotEvents(scope = document) {
  scope.querySelectorAll('.equipped-slot-select[data-equipped-slot]').forEach(select => {
    select.addEventListener('change', () => {
      const slotKey = select.dataset.equippedSlot;
      currentEquippedSlotsState[slotKey] = select.value || "";
      select.dataset.selectedItemId = select.value || "";
      renderEquippedNodeMap();
    });
  });
}

function populateEquippedSelects(scope = document) {
  scope.querySelectorAll('.equipped-slot-select').forEach(select => {
    refreshEquippedSelect(select);
    if (select.dataset.equippedSlot) {
      currentEquippedSlotsState[select.dataset.equippedSlot] = select.value || "";
      const card = select.closest('.equipped-slot-card');
      if (card) card.classList.toggle('is-active', Boolean(select.value));
    }
  });
}

function renderEquippedSilhouetteColumns(equippedSlots = currentEquippedSlotsState) {
  const left = document.getElementById('equippedLeftColumn');
  const right = document.getElementById('equippedRightColumn');
  if (!left || !right) return;

  left.innerHTML = EQUIPPED_SILHOUETTE_COLUMNS.left
    .map(key => createEquippedSlotCard(findEquippedSlotDefinition(key), equippedSlots[key] || ""))
    .join('');

  right.innerHTML = EQUIPPED_SILHOUETTE_COLUMNS.right
    .map(key => createEquippedSlotCard(findEquippedSlotDefinition(key), equippedSlots[key] || ""))
    .join('');

  bindEquippedSlotEvents(left);
  bindEquippedSlotEvents(right);
  populateEquippedSelects(left);
  populateEquippedSelects(right);
  bindEquippedCardInteractions(left);
  bindEquippedCardInteractions(right);
}

function renderEquippedListView(equippedSlots = currentEquippedSlotsState) {
  const list = document.getElementById('equippedListView');
  if (!list) return;

  list.innerHTML = EQUIPPED_SLOT_DEFINITIONS
    .map(slot => createEquippedSlotCard(slot, equippedSlots[slot.key] || ""))
    .join('');

  bindEquippedSlotEvents(list);
  populateEquippedSelects(list);
  bindEquippedCardInteractions(list);
}

function resolveEquippedNodeStates() {
  const states = {};

  EQUIPPED_SLOT_DEFINITIONS.forEach(slot => {
    const itemId = currentEquippedSlotsState[slot.key] || "";
    states[slot.key] = {
      filled: Boolean(itemId),
      label: ""
    };
  });

  document.querySelectorAll('.equipped-slot-select[data-equipped-slot]').forEach(select => {
    const slotKey = select.dataset.equippedSlot;
    if (!slotKey) return;
    states[slotKey] = {
      filled: Boolean(select.value),
      label: getSelectedOptionLabel(select)
    };
  });

  document.querySelectorAll('#customEquippedSlots .custom-equipped-slot').forEach(row => {
    const name = row.querySelector('.custom-equipped-slot-name')?.value.trim() || "";
    const select = row.querySelector('.equipped-slot-select');
    if (!name || !select?.value) return;

    const hint = CUSTOM_SLOT_NODE_HINTS.find(entry => entry.pattern.test(name));
    if (!hint) return;

    if (!states[hint.slot] || !states[hint.slot].filled) {
      states[hint.slot] = {
        filled: true,
        label: getSelectedOptionLabel(select) || name
      };
    }
  });

  return states;
}

function focusEquippedSlot(slotKey) {
  const selector = `.equipped-slot-select[data-equipped-slot="${slotKey}"]`;
  const select = document.querySelector(selector);
  if (!select) return;

  select.focus({ preventScroll: false });
  select.closest(".equipped-slot-card")?.classList.add("is-focused");
  window.setTimeout(() => {
    select.closest(".equipped-slot-card")?.classList.remove("is-focused");
  }, 700);
}

function clearEquippedHoverState() {
  document.querySelectorAll(".silhouette-node.is-hovered").forEach(node => {
    node.classList.remove("is-hovered");
  });

  document.querySelectorAll(".equipped-slot-card.is-hovered").forEach(card => {
    card.classList.remove("is-hovered");
  });
}

function setEquippedHoverState(slotKey, active) {
  if (!slotKey) return;

  document
    .querySelectorAll(`.silhouette-node[data-slot-key="${slotKey}"]`)
    .forEach(node => node.classList.toggle("is-hovered", active));

  document
    .querySelectorAll(`.equipped-slot-card[data-slot-key="${slotKey}"]`)
    .forEach(card => card.classList.toggle("is-hovered", active));
}

function bindSilhouetteNodeInteractions() {
  // Silhouette view removed.
}

function bindEquippedCardInteractions(scope = document) {
  scope.querySelectorAll(".equipped-slot-card").forEach(card => {
    if (card.dataset.interactionsBound === "true") return;

    const slotKey = card.dataset.slotKey;
    card.dataset.interactionsBound = "true";
    card.addEventListener("mouseenter", () => setEquippedHoverState(slotKey, true));
    card.addEventListener("mouseleave", () => setEquippedHoverState(slotKey, false));
    card.addEventListener("focusin", () => setEquippedHoverState(slotKey, true));
    card.addEventListener("focusout", () => setEquippedHoverState(slotKey, false));
  });
}

function renderEquippedNodeMap() {
  const states = resolveEquippedNodeStates();

  document.querySelectorAll('.equipped-slot-card').forEach(card => {
    const slotKey = card.dataset.slotKey;
    const active = Boolean(states[slotKey]?.filled);
    card.classList.toggle('is-active', active);
  });

  bindEquippedCardInteractions();
}

function renderEquippedActiveView() {
  const listView = document.getElementById('equippedListView');
  if (listView) listView.hidden = false;
  renderEquippedListView(currentEquippedSlotsState);
  renderEquippedNodeMap();
  updateInventorySortHeaders();
}

function inventoryId(prefix = "item") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inventorySafeValue(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inventorySafeText(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeInventoryType(type = "gear") {
  return type === "equipment" ? "gear" : String(type || "gear");
}

function normalizeInventoryLocation(location = "") {
  return location === "carried" ? "worn" : String(location || "");
}

function normalizeInventoryItem(data = {}, prefix = "gear") {
  return {
    id: String(data.id || inventoryId(prefix)),
    name: String(data.name || ""),
    type: normalizeInventoryType(data.type || prefix || "gear"),
    rarity: inferInventoryRarity(data),
    qty: String(data.qty || ""),
    value: normalizeInventoryRarity(data.value) ? "" : String(data.value || ""),
    location: normalizeInventoryLocation(data.location),
    details: String(data.details || ""),
    open: data.open === true
  };
}

function normalizeStorageLocation(data = {}) {
  return {
    id: String(data.id || inventoryId("storage")),
    name: String(data.name || ""),
    type: String(data.type || ""),
    notes: String(data.notes || "")
  };
}

function inventoryRemoveButton(label = "row") {
  return `
    <td class="inventory-remove-cell">
      <button
        type="button"
        class="inventory-remove"
        title="Remove ${inventorySafeValue(label)}"
        aria-label="Remove ${inventorySafeValue(label)}"
      >×</button>
    </td>
  `;
}

function inventoryInputCell(className, value = "", placeholder = "") {
  return `
    <td>
      <input
        class="${className}"
        type="text"
        value="${inventorySafeValue(value)}"
        placeholder="${inventorySafeValue(placeholder)}"
      >
    </td>
  `;
}

function inventoryLocationCell(value = "") {
  return `
    <td>
      <select class="inventory-location" data-selected-location="${inventorySafeValue(value)}">
      </select>
    </td>
  `;
}

function inventoryTypeCell(value = "gear") {
  const normalizedValue = normalizeInventoryType(value);

  return `
    <td>
      <select class="inventory-item-type">
        ${INVENTORY_ITEM_TYPE_OPTIONS
          .map(option => `
            <option value="${inventorySafeValue(option.value)}"${option.value === normalizedValue ? " selected" : ""}>
              ${inventorySafeValue(option.label)}
            </option>
          `)
          .join("")}
      </select>
    </td>
  `;
}

function inventoryTypeLabel(type = "gear") {
  const normalizedType = normalizeInventoryType(type);
  return INVENTORY_ITEM_TYPE_OPTIONS.find(option => option.value === normalizedType)?.label || "Other";
}

function getStorageLocations() {
  return Array.from(
    document.querySelectorAll("#storageLocationsBody .storage-location-row")
  ).map(row => ({
    id: row.dataset.storageId,
    name: row.querySelector(".storage-location-name")?.value.trim() || "",
    type: row.querySelector(".storage-location-type")?.value.trim() || "",
    notes: row.querySelector(".storage-location-notes")?.value.trim() || ""
  }));
}

function locationOptions() {
  return [
    ...STANDARD_ITEM_LOCATIONS,
    ...getStorageLocations()
      .filter(location => location.name)
      .map(location => ({
        value: `storage:${location.id}`,
        label: location.name
      }))
  ];
}

function refreshLocationSelect(select) {
  if (!select) return;

  const previous = normalizeInventoryLocation(
    select.value || select.dataset.selectedLocation || ""
  );

  select.innerHTML = locationOptions()
    .map(option => `
      <option value="${inventorySafeValue(option.value)}">
        ${inventorySafeValue(option.label)}
      </option>
    `)
    .join("");

  select.value = Array.from(select.options).some(option => option.value === previous)
    ? previous
    : "";

  select.dataset.selectedLocation = select.value;
}

function refreshAllLocationSelects() {
  document.querySelectorAll(".inventory-location").forEach(refreshLocationSelect);
  updateAllInventoryItemSummaries();
}

function getEquippableItems() {
  const groups = {
    equipment: [],
    magicItems: [],
    consumables: [],
    other: [],
    storageItems: []
  };

  document
    .querySelectorAll("#inventoryItemsBody .inventory-entry")
    .forEach(row => {
      const name = row.querySelector(".inventory-item-name")?.value.trim() || "";
      const type = row.querySelector(".inventory-item-type")?.value || "gear";
      if (!name) return;

      const item = { id: row.dataset.itemId, label: name };

      if (type === "magic") groups.magicItems.push(item);
      else if (type === "consumable") groups.consumables.push(item);
      else if (type === "other") groups.other.push(item);
      else groups.equipment.push(item);
    });

  getStorageLocations()
    .filter(location => location.name)
    .forEach(location => {
      groups.storageItems.push({
        id: `storage:${location.id}`,
        label: location.name
      });
    });

  return groups;
}

function equippedOptionGroup(label, items) {
  if (!items.length) return "";

  return `
    <optgroup label="${inventorySafeValue(label)}">
      ${items
        .map(item => `
          <option value="${inventorySafeValue(item.id)}">
            ${inventorySafeValue(item.label)}
          </option>
        `)
        .join("")}
    </optgroup>
  `;
}

function refreshEquippedSelect(select) {
  if (!select) return;

  const previous = select.value || select.dataset.selectedItemId || "";
  const groups = getEquippableItems();

  select.innerHTML = `
    <option value="">— None —</option>
    ${equippedOptionGroup("Equipment", groups.equipment)}
    ${equippedOptionGroup("Magic Items", groups.magicItems)}
    ${equippedOptionGroup("Potions / Consumables", groups.consumables)}
    ${equippedOptionGroup("Other", groups.other)}
    ${equippedOptionGroup("Storage / Bags", groups.storageItems)}
  `;

  select.value = Array.from(select.options).some(option => option.value === previous)
    ? previous
    : "";

  select.dataset.selectedItemId = select.value;
}

function refreshAllEquippedSelects() {
  document.querySelectorAll(".equipped-slot-select").forEach(select => {
    refreshEquippedSelect(select);
    if (select.dataset.equippedSlot) {
      currentEquippedSlotsState[select.dataset.equippedSlot] = select.value || "";
    }
  });
  renderEquippedNodeMap();
}

function refreshLocationFilter() {
  const filter = document.getElementById("inventoryLocationFilter");
  if (!filter) return;

  const previous = filter.value || "all";

  filter.innerHTML = `
    <option value="all">All Locations</option>
    ${locationOptions()
      .map(option => `
        <option value="${inventorySafeValue(option.value)}">
          ${inventorySafeValue(option.label)}
        </option>
      `)
      .join("")}
  `;

  filter.value = Array.from(filter.options).some(option => option.value === previous)
    ? previous
    : "all";

  applyInventoryFilters();
}

function setFilteredRowVisibility(row, visible) {
  row.hidden = !visible;
}

function applyInventoryFilters() {
  const locationFilter = document.getElementById("inventoryLocationFilter")?.value || "all";
  const typeFilter = document.getElementById("inventoryTypeFilter")?.value || "all";
  const rarityFilter = document.getElementById("inventoryRarityFilter")?.value || "all";
  const searchText = (document.getElementById("inventorySearchInput")?.value || "")
    .trim()
    .toLowerCase();

  document
    .querySelectorAll("#inventoryItemsBody .inventory-entry")
    .forEach(row => {
      const location = row.querySelector(".inventory-location")?.value || "";
      const type = normalizeInventoryType(
        row.querySelector(".inventory-item-type")?.value || "gear"
      );
      const rarity = normalizeInventoryRarity(row.querySelector(".inventory-item-rarity")?.value);
      const searchable = [
        row.querySelector(".inventory-item-name")?.value || "",
        inventoryTypeLabel(type),
        rarity,
        row.querySelector(".inventory-item-details")?.value || ""
      ]
        .join(" ")
        .toLowerCase();

      const filterMatch =
        (locationFilter === "all" || location === locationFilter) &&
        (typeFilter === "all" || type === typeFilter) &&
        (rarityFilter === "all" || rarity === rarityFilter || (rarityFilter === "none" && !rarity)) &&
        (!searchText || searchable.includes(searchText));

      row.dataset.inventoryFilterMatch = filterMatch ? "true" : "false";
      setFilteredRowVisibility(row, filterMatch);
    });

  document
    .querySelectorAll("#inventoryGemsBody .inventory-gem-row")
    .forEach(row => {
      const location = row.querySelector(".inventory-location")?.value || "";
      const searchable = [
        row.querySelector(".inventory-gem-name")?.value || "",
        row.querySelector(".inventory-gem-notes")?.value || ""
      ]
        .join(" ")
        .toLowerCase();

      const visible =
        (locationFilter === "all" || location === locationFilter) &&
        typeFilter === "all" &&
        rarityFilter === "all" &&
        (!searchText || searchable.includes(searchText));

      row.hidden = !visible;
    });
}

function applyInventoryLocationFilter() {
  applyInventoryFilters();
}

function refreshInventoryDependentOptions() {
  refreshAllLocationSelects();
  refreshAllEquippedSelects();
  refreshLocationFilter();
}

function attachItemRowBehavior(row) {
  const editor = row.querySelector(".inventory-entry-editor");
  const openButton = row.querySelector(".inventory-entry-open");
  const nameInput = row.querySelector(".inventory-item-name");
  const locationSelect = row.querySelector(".inventory-location");
  const typeSelect = row.querySelector(".inventory-item-type");
  const detailsTextarea = row.querySelector(".inventory-item-details");
  const requiresAttunement = row.querySelector(".inventory-item-requires-attunement");

  const setOpen = open => {
    editor.hidden = !open;
    row.classList.toggle("is-open", open);
    openButton.setAttribute("aria-expanded", String(open));
  };

  row.querySelector(".inventory-entry-summary").addEventListener("click", event => {
    if (event.target.closest(".inventory-attune-toggle")) return;
    setOpen(editor.hidden);
  });

  row.querySelector(".inventory-attune-toggle").addEventListener("click", () => toggleItemAttunement(row));

  row.querySelector(".inventory-entry-remove").addEventListener("click", () => {
    if (!confirm(`Remove ${nameInput.value.trim() || "this item"} from the inventory?`)) return;
    row.remove();
    refreshInventoryDependentOptions();
    refreshAttunementButtons();
  });

  nameInput.addEventListener("input", () => {
    // Keep typing smooth: re-sort only when the edit is committed, so the row does not move mid-word.
    refreshAllEquippedSelects();
    updateInventoryItemSummary(row);
    refreshAttunementButtons();
  });
  nameInput.addEventListener("change", () => {
    refreshAllEquippedSelects();
    inventorySortState.key === "name" ? applyInventorySort() : applyInventoryFilters();
  });

  row.querySelectorAll(".inventory-item-qty, .inventory-item-value").forEach(input => {
    input.addEventListener("input", () => updateInventoryItemSummary(row));
  });

  detailsTextarea.addEventListener("input", () => {
    requiresAttunement.checked = /requires attunement/i.test(detailsTextarea.value);
    refreshAttunementButtons();
    applyInventoryFilters();
  });

  requiresAttunement.addEventListener("change", () => {
    setRequiresAttunementNote(detailsTextarea, requiresAttunement.checked);
    refreshAttunementButtons();
  });

  locationSelect.addEventListener("change", () => {
    locationSelect.dataset.selectedLocation = locationSelect.value;
    updateInventoryItemSummary(row);
    inventorySortState.key === "location" ? applyInventorySort() : applyInventoryFilters();
  });

  [typeSelect, row.querySelector(".inventory-item-rarity")].forEach(select => {
    select.addEventListener("change", () => {
      refreshAllEquippedSelects();
      updateInventoryItemSummary(row);
      applyInventorySort();
    });
  });

  return setOpen;
}

function addUnifiedInventoryRow(data = {}) {
  const body = document.getElementById("inventoryItemsBody");
  if (!body) return;

  const item = normalizeInventoryItem(data, data.type || "gear");
  const row = document.createElement("div");
  row.className = "inventory-entry";
  row.dataset.itemId = item.id;

  row.innerHTML = `
    <div class="inventory-entry-summary">
      <button type="button" class="inventory-entry-open" aria-expanded="false">
        <span class="inventory-entry-name"></span>
        <span class="inventory-entry-meta"></span>
      </button>
      <button type="button" class="inventory-attune-toggle" aria-pressed="false" hidden></button>
      <span class="inventory-entry-qty"></span>
      <span class="inventory-entry-value"></span>
      <span class="inventory-entry-chevron" aria-hidden="true">⌄</span>
    </div>
    <div class="inventory-entry-editor" hidden>
      <label class="inventory-entry-field inventory-entry-field-name"><span>Item</span>
        <input class="inventory-item-name" type="text" value="${inventorySafeValue(item.name)}" placeholder="Item name…">
      </label>
      <label class="inventory-entry-field"><span>Type</span>
        <select class="inventory-item-type">${INVENTORY_ITEM_TYPE_OPTIONS
          .map(option => `<option value="${inventorySafeValue(option.value)}"${option.value === item.type ? " selected" : ""}>${inventorySafeValue(option.label)}</option>`)
          .join("")}</select>
      </label>
      <label class="inventory-entry-field"><span>Rarity</span>
        <select class="inventory-item-rarity">${inventoryRarityOptions(item.rarity)}</select>
      </label>
      <label class="inventory-entry-field inventory-entry-field-small"><span>Qty</span>
        <input class="inventory-item-qty" type="text" inputmode="numeric" value="${inventorySafeValue(item.qty)}" placeholder="1">
      </label>
      <label class="inventory-entry-field inventory-entry-field-small"><span>Value</span>
        <input class="inventory-item-value" type="text" value="${inventorySafeValue(item.value)}" placeholder="—">
      </label>
      <label class="inventory-entry-field"><span>Location</span>
        <select class="inventory-location" data-selected-location="${inventorySafeValue(item.location)}"></select>
      </label>
      <label class="inventory-entry-field inventory-entry-field-details"><span>Details</span>
        <textarea class="inventory-item-details" placeholder="Description, properties, charges, weight, lore, reminders…">${inventorySafeText(item.details)}</textarea>
      </label>
      <div class="inventory-entry-actions">
        <label class="inventory-entry-check">
          <input class="inventory-item-requires-attunement" type="checkbox"${/requires attunement/i.test(item.details) ? " checked" : ""}>
          <span>Requires attunement</span>
        </label>
        <span class="inventory-entry-buttons">
          <button type="button" class="inventory-entry-to-party">Move to party stash</button>
          <button type="button" class="inventory-entry-remove">Remove item</button>
        </span>
      </div>
    </div>
  `;

  body.appendChild(row);

  const setOpen = attachItemRowBehavior(row);
  refreshInventoryDependentOptions();
  updateInventoryItemSummary(row);
  refreshAttunementButtons();
  applyInventorySort();

  // A new blank item opens straight away so it can be named.
  if (!item.name) {
    setOpen(true);
    row.querySelector(".inventory-item-name").focus();
  }
}

function addInventoryEquipmentRow(data = {}) {
  addUnifiedInventoryRow({ ...data, type: normalizeInventoryType(data.type || "gear") });
}

function addInventoryMagicItemRow(data = {}) {
  addUnifiedInventoryRow({ ...data, type: data.type || "magic" });
}

function addInventoryConsumableRow(data = {}) {
  addUnifiedInventoryRow({ ...data, type: data.type || "consumable" });
}

// Reads values such as "30", "50 gp", "5 sp", or "1,000 GP" as gold pieces (plain numbers are gold).
function parseGoldValue(text = "") {
  const match = String(text).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)?/i);
  if (!match) return null;
  const perGold = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
  return Number(match[1]) * perGold[(match[2] || "gp").toLowerCase()];
}

function formatGold(value) {
  return `${Number(value.toFixed(2)).toLocaleString()} gp`;
}

// Totals each valuable (quantity × value each), the valuables overall, and coins plus valuables.
function updateInventoryWealth() {
  let valuablesTotal = 0;
  let valuablesCount = 0;

  document.querySelectorAll("#inventoryGemsBody .inventory-gem-row").forEach(row => {
    const qtyText = row.querySelector(".inventory-gem-qty")?.value.trim() || "";
    const qty = qtyText === "" ? 1 : Number.parseFloat(qtyText) || 0;
    const each = parseGoldValue(row.querySelector(".inventory-gem-value")?.value);
    const total = each === null ? null : each * qty;
    const target = row.querySelector(".inventory-gem-total strong");
    if (target) target.textContent = total === null ? "—" : formatGold(total);
    if (row.querySelector(".inventory-gem-name")?.value.trim() || total) valuablesCount += qty;
    valuablesTotal += total || 0;
  });

  const coinTotal = [["copperPieces", 0.01], ["silverPieces", 0.1], ["electrumPieces", 0.5], ["goldPieces", 1], ["platinumPieces", 10]]
    .reduce((sum, [key, perGold]) => sum + (Number.parseFloat(document.querySelector(`[data-field="${key}"]`)?.value) || 0) * perGold, 0);

  const summary = document.getElementById("inventoryGemsSummary");
  if (summary) {
    summary.textContent = valuablesCount
      ? `${valuablesCount.toLocaleString()} valuable${valuablesCount === 1 ? "" : "s"} · worth ${formatGold(valuablesTotal)}`
      : "";
  }

  const wealth = document.getElementById("inventoryWealth");
  if (wealth) {
    wealth.innerHTML = `<span>Total wealth</span><strong>${formatGold(coinTotal + valuablesTotal)}</strong><em>Coins ${formatGold(coinTotal)} · Valuables ${formatGold(valuablesTotal)}</em>`;
  }
}

function addInventoryGemRow(data = {}) {
  const body = document.getElementById("inventoryGemsBody");
  if (!body) return;

  const gem = {
    id: String(data.id || inventoryId("gem")),
    name: String(data.name || ""),
    qty: String(data.qty || ""),
    value: String(data.value || ""),
    location: normalizeInventoryLocation(data.location),
    notes: String(data.notes || "")
  };

  const row = document.createElement("div");
  row.className = "inventory-gem-row";
  row.dataset.itemId = gem.id;

  row.innerHTML = `
    <span class="inventory-gem-icon" aria-hidden="true">◆</span>
    <div class="inventory-gem-main">
      <input class="inventory-gem-name" type="text" value="${inventorySafeValue(gem.name)}" placeholder="Ruby, silver chalice, diamond dust…" aria-label="Gem or valuable">
      <input class="inventory-gem-notes" type="text" value="${inventorySafeValue(gem.notes)}" placeholder="Notes…" aria-label="Notes">
    </div>
    <label class="inventory-gem-field inventory-gem-qty-field"><span>Qty</span><input class="inventory-gem-qty" type="text" inputmode="numeric" value="${inventorySafeValue(gem.qty)}" placeholder="1"></label>
    <label class="inventory-gem-field inventory-gem-value-field"><span>Each</span><input class="inventory-gem-value" type="text" value="${inventorySafeValue(gem.value)}" placeholder="50 gp"></label>
    <div class="inventory-gem-field inventory-gem-total"><span>Total</span><strong>—</strong></div>
    <label class="inventory-gem-field inventory-gem-location-field"><span>Location</span><select class="inventory-location" data-selected-location="${inventorySafeValue(gem.location)}"></select></label>
    <button type="button" class="inventory-remove" title="Remove gem or valuable" aria-label="Remove gem or valuable">×</button>
  `;

  body.appendChild(row);

  const locationSelect = row.querySelector(".inventory-location");

  locationSelect?.addEventListener("change", () => {
    locationSelect.dataset.selectedLocation = locationSelect.value;
    applyInventoryFilters();
  });

  row.querySelectorAll(".inventory-gem-qty, .inventory-gem-value").forEach(input => {
    input.addEventListener("input", updateInventoryWealth);
  });

  row.querySelector(".inventory-remove")?.addEventListener("click", () => {
    row.remove();
    applyInventoryFilters();
    updateInventoryWealth();
  });

  refreshInventoryDependentOptions();
  updateInventoryWealth();
}

function addInventoryAttunementRow(data = {}) {
  const body = document.getElementById("inventoryAttunementBody");
  if (!body) return;

  const row = document.createElement("tr");
  row.className = "inventory-attunement-row";

  row.innerHTML = `
    <td class="inventory-slot-number"></td>
  ` +
    inventoryInputCell("inventory-attunement-item", data.item || "", "Attuned item…") +
    inventoryInputCell("inventory-attunement-notes", data.notes || "", "Notes…") +
    inventoryRemoveButton("attunement slot");

  body.appendChild(row);

  row.querySelector(".inventory-remove")?.addEventListener("click", () => {
    row.remove();
    renumberInventoryAttunementRows();
    refreshAttunementButtons();
  });

  renumberInventoryAttunementRows();
  refreshAttunementButtons();
}

function addStorageLocationRow(data = {}) {
  const body = document.getElementById("storageLocationsBody");
  if (!body) return;

  const storage = normalizeStorageLocation(data);

  const row = document.createElement("tr");
  row.className = "storage-location-row";
  row.dataset.storageId = storage.id;

  row.innerHTML =
    inventoryInputCell("storage-location-name", storage.name, (window.themeText?.("Backpack, ship cabin, home…", "Backpack, wagon, home…") ?? "Backpack, ship cabin, home…")) +
    inventoryInputCell("storage-location-type", storage.type, "Bag, room, chest…") +
    inventoryInputCell("storage-location-notes", storage.notes, "Notes…") +
    inventoryRemoveButton("container or location");

  body.appendChild(row);

  row.querySelector(".storage-location-name")?.addEventListener(
    "input",
    refreshInventoryDependentOptions
  );

  row.querySelector(".inventory-remove")?.addEventListener("click", () => {
    row.remove();
    refreshInventoryDependentOptions();
  });

  refreshInventoryDependentOptions();
}

function renumberInventoryAttunementRows() {
  document
    .querySelectorAll("#inventoryAttunementBody .inventory-attunement-row")
    .forEach((row, index) => {
      const slot = row.querySelector(".inventory-slot-number");
      if (slot) slot.textContent = String(index + 1);
    });
}

function renderEquippedSlots(savedSlots = {}, customSlots = []) {
  currentEquippedSlotsState = Object.fromEntries(
    EQUIPPED_SLOT_DEFINITIONS.map(slot => [slot.key, savedSlots[slot.key] || ""])
  );

  renderCustomEquippedSlots(customSlots);
  renderEquippedActiveView();
}

function addCustomEquippedSlot(data = {}) {
  const container = document.getElementById("customEquippedSlots");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "custom-equipped-slot";
  row.dataset.customSlotId = String(data.id || inventoryId("slot"));

  row.innerHTML = `
    <input
      class="custom-equipped-slot-name"
      type="text"
      value="${inventorySafeValue(data.label || "")}"
      placeholder="Gloves, bracers, quiver…"
      aria-label="Custom equipped slot name"
    >

    <select
      class="equipped-slot-select custom-equipped-slot-select"
      data-selected-item-id="${inventorySafeValue(data.itemId || "")}"
      aria-label="Custom equipped item"
    ></select>

    <button
      type="button"
      class="inventory-remove custom-equipped-remove"
      title="Remove custom slot"
      aria-label="Remove custom equipped slot"
    >×</button>
  `;

  container.appendChild(row);

  const select = row.querySelector(".equipped-slot-select");

  refreshEquippedSelect(select);

  select?.addEventListener("change", () => {
    select.dataset.selectedItemId = select.value;
    renderEquippedNodeMap();
  });

  row.querySelector(".custom-equipped-slot-name")?.addEventListener("input", renderEquippedNodeMap);

  row.querySelector(".custom-equipped-remove")?.addEventListener("click", () => {
    row.remove();
    renderEquippedNodeMap();
  });
}

function renderCustomEquippedSlots(customSlots = []) {
  const container = document.getElementById("customEquippedSlots");
  if (!container) return;

  container.innerHTML = "";
  (customSlots || []).forEach(addCustomEquippedSlot);
}

function collectEquippedSlots() {
  return { ...currentEquippedSlotsState };
}

function collectCustomEquippedSlots() {
  return Array.from(
    document.querySelectorAll("#customEquippedSlots .custom-equipped-slot")
  )
    .map(row => ({
      id: row.dataset.customSlotId,
      label: row.querySelector(".custom-equipped-slot-name")?.value.trim() || "",
      itemId: row.querySelector(".equipped-slot-select")?.value || ""
    }))
    .filter(slot => slot.label || slot.itemId);
}

function collectStorageLocations() {
  return getStorageLocations()
    .filter(location => location.name || location.type || location.notes);
}

function collectUnifiedInventoryRows() {
  return Array.from(
    document.querySelectorAll("#inventoryItemsBody .inventory-entry")
  )
    .map(row => ({
      id: row.dataset.itemId,
      name: row.querySelector(".inventory-item-name")?.value.trim() || "",
      type: normalizeInventoryType(row.querySelector(".inventory-item-type")?.value || "gear"),
      rarity: normalizeInventoryRarity(row.querySelector(".inventory-item-rarity")?.value),
      qty: row.querySelector(".inventory-item-qty")?.value.trim() || "",
      value: row.querySelector(".inventory-item-value")?.value.trim() || "",
      location: normalizeInventoryLocation(row.querySelector(".inventory-location")?.value.trim() || ""),
      details: row.querySelector(".inventory-item-details")?.value || "",
      open: false
    }))
    .filter(row => row.name || row.qty || row.value || row.location || row.details);
}

function collectInventoryEquipmentRows() {
  return collectUnifiedInventoryRows().filter(
    row => !["magic", "consumable"].includes(row.type)
  );
}

function collectInventoryMagicItemRows() {
  return collectUnifiedInventoryRows().filter(row => row.type === "magic");
}

function collectInventoryConsumableRows() {
  return collectUnifiedInventoryRows().filter(row => row.type === "consumable");
}

function mergeLegacyInventoryRows({
  inventoryItems = [],
  equipment = [],
  magicItems = [],
  consumables = []
} = {}) {
  if (Array.isArray(inventoryItems) && inventoryItems.length) {
    return inventoryItems.map(item => ({
      ...item,
      type: normalizeInventoryType(item.type || "gear")
    }));
  }

  return [
    ...(equipment || []).map(item => ({
      ...item,
      type: normalizeInventoryType(item.type || "gear")
    })),
    ...(magicItems || []).map(item => ({ ...item, type: item.type || "magic" })),
    ...(consumables || []).map(item => ({ ...item, type: item.type || "consumable" }))
  ];
}

function collectInventoryGemRows() {
  return Array.from(
    document.querySelectorAll("#inventoryGemsBody .inventory-gem-row")
  )
    .map(row => ({
      id: row.dataset.itemId,
      name: row.querySelector(".inventory-gem-name")?.value.trim() || "",
      qty: row.querySelector(".inventory-gem-qty")?.value.trim() || "",
      value: row.querySelector(".inventory-gem-value")?.value.trim() || "",
      location: normalizeInventoryLocation(row.querySelector(".inventory-location")?.value.trim() || ""),
      notes: row.querySelector(".inventory-gem-notes")?.value.trim() || ""
    }))
    .filter(row =>
      row.name ||
      row.qty ||
      row.value ||
      row.location ||
      row.notes
    );
}

function collectInventoryAttunementRows() {
  return Array.from(
    document.querySelectorAll("#inventoryAttunementBody .inventory-attunement-row")
  ).map(row => ({
    item: row.querySelector(".inventory-attunement-item")?.value.trim() || "",
    notes: row.querySelector(".inventory-attunement-notes")?.value.trim() || ""
  }));
}

function resetInventoryRows({
  inventoryItems = DEFAULT_UNIFIED_INVENTORY_ROWS,
  equipment = DEFAULT_INVENTORY_EQUIPMENT_ROWS,
  magicItems = DEFAULT_INVENTORY_MAGIC_ITEM_ROWS,
  consumables = DEFAULT_INVENTORY_CONSUMABLE_ROWS,
  gems = DEFAULT_INVENTORY_GEM_ROWS,
  attunement = DEFAULT_INVENTORY_ATTUNEMENT_ROWS,
  storageLocations = DEFAULT_STORAGE_LOCATION_ROWS,
  equippedSlots = {},
  customEquippedSlots = [],
  inventoryView = SILHOUETTE_VIEW_DEFAULT
} = {}) {
  const itemsBody = document.getElementById("inventoryItemsBody");
  const gemsBody = document.getElementById("inventoryGemsBody");
  const attunementBody = document.getElementById("inventoryAttunementBody");
  const storageBody = document.getElementById("storageLocationsBody");

  if (itemsBody) itemsBody.innerHTML = "";
  if (gemsBody) gemsBody.innerHTML = "";
  if (attunementBody) attunementBody.innerHTML = "";
  if (storageBody) storageBody.innerHTML = "";

  (storageLocations || []).forEach(addStorageLocationRow);

  mergeLegacyInventoryRows({
    inventoryItems,
    equipment,
    magicItems,
    consumables
  }).forEach(addUnifiedInventoryRow);

  (gems || []).forEach(addInventoryGemRow);
  (attunement || []).forEach(addInventoryAttunementRow);

  renumberInventoryAttunementRows();
  renderEquippedSlots(equippedSlots || {}, customEquippedSlots || []);
  setInventoryView(inventoryView || SILHOUETTE_VIEW_DEFAULT);
  refreshInventoryDependentOptions();
  syncCoinageMirrorsFromCanonical();
  updateInventoryWealth();
  renderEquippedNodeMap();
}

function syncCoinageMirrorsFromCanonical() {
  document
    .querySelectorAll("[data-field][data-coinage-key]")
    .forEach(canonical => {
      document
        .querySelectorAll(`[data-coinage-key="${canonical.dataset.coinageKey}"]`)
        .forEach(field => {
          if (field !== canonical) {
            field.value = canonical.value;
          }
        });
    });
}

function bindCoinageMirrors() {
  document
    .querySelectorAll("[data-coinage-key]")
    .forEach(field => {
      field.addEventListener("input", () => {
        document
          .querySelectorAll(`[data-coinage-key="${field.dataset.coinageKey}"]`)
          .forEach(other => {
            if (other !== field) {
              other.value = field.value;
            }
          });
      });
    });

  syncCoinageMirrorsFromCanonical();
}

function bindInventoryControls() {
  bindCoinageMirrors();
  document.querySelectorAll("[data-coinage-key]").forEach(field => field.addEventListener("input", updateInventoryWealth));
  bindInventoryViewToggle();

  document
    .querySelectorAll("[data-inventory-sort-key]")
    .forEach(button => {
      button.addEventListener("click", () => {
        sortInventoryItems(button.dataset.inventorySortKey || "name");
      });
    });

  document
    .getElementById("inventoryLocationFilter")
    ?.addEventListener("change", applyInventoryFilters);

  document
    .getElementById("inventoryTypeFilter")
    ?.addEventListener("change", applyInventoryFilters);

  document
    .getElementById("inventoryRarityFilter")
    ?.addEventListener("change", applyInventoryFilters);

  document
    .getElementById("inventoryAttunementBody")
    ?.addEventListener("input", refreshAttunementButtons);

  document
    .getElementById("inventorySearchInput")
    ?.addEventListener("input", applyInventoryFilters);

  document
    .getElementById("inventoryMobileSortSelect")
    ?.addEventListener("change", event => {
      inventorySortState.key = event.target.value || "name";
      inventorySortState.direction = "asc";
      applyInventorySort();
    });

  document
    .getElementById("inventoryMobileSortDirection")
    ?.addEventListener("click", () => {
      inventorySortState.direction = inventorySortState.direction === "asc"
        ? "desc"
        : "asc";
      applyInventorySort();
    });

  updateInventoryMobileSortControls();
  refreshLocationFilter();
  setInventoryView(SILHOUETTE_VIEW_DEFAULT);
  renderEquippedNodeMap();
}
