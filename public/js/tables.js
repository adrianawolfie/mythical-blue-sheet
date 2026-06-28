// Mythical Blue · Weapons and spells
// Editable weapon and spell tables.

const DEFAULT_WEAPON_ROWS = [
  {
    name: "Cutlass",
    atk: "+5",
    damage: "1d6+3 slashing",
    notes: "Finesse"
  },
  { name: "", atk: "", damage: "", notes: "" },
  { name: "", atk: "", damage: "", notes: "" },
  { name: "", atk: "", damage: "", notes: "" },
  { name: "", atk: "", damage: "", notes: "" }
];

const DEFAULT_SPELL_ROWS = [
  {
    level: "C",
    name: "Mage Hand",
    castTime: "1 action",
    range: "30 ft",
    concentration: false,
    ritual: false,
    material: false,
    effect: "",
    details: "",
    open: false
  },
  {
    level: "C",
    name: "Control Water",
    castTime: "1 action",
    range: "300 ft",
    concentration: true,
    ritual: false,
    material: false,
    effect: "",
    details: "",
    open: false
  },
  {
    level: "1",
    name: "Fog Cloud",
    castTime: "1 action",
    range: "120 ft",
    concentration: true,
    ritual: false,
    material: false,
    effect: "",
    details: "",
    open: false
  },
  {
    level: "2",
    name: "Misty Step",
    castTime: "Bonus",
    range: "Self",
    concentration: false,
    ritual: false,
    material: false,
    effect: "",
    details: "",
    open: false
  },
  {
    level: "3",
    name: "Call Lightning",
    castTime: "1 action",
    range: "120 ft",
    concentration: true,
    ritual: false,
    material: false,
    effect: "",
    details: "",
    open: false
  },
  { level: "", name: "", castTime: "", range: "", concentration: false, ritual: false, material: false, effect: "", details: "", open: false },
  { level: "", name: "", castTime: "", range: "", concentration: false, ritual: false, material: false, effect: "", details: "", open: false },
  { level: "", name: "", castTime: "", range: "", concentration: false, ritual: false, material: false, effect: "", details: "", open: false },
  { level: "", name: "", castTime: "", range: "", concentration: false, ritual: false, material: false, effect: "", details: "", open: false }
];

function safeValue(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeText(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tableCell(className, value = "") {
  return `<td><input class="${className}" type="text" value="${safeValue(value)}" /></td>`;
}

function makeEditCell() {
  return `
    <td class="row-edit-cell">
      <div class="row-edit-tools">
        <button type="button" class="row-up" title="Move up">↑</button>
        <button type="button" class="row-down" title="Move down">↓</button>
        <button type="button" class="row-delete delete-x" title="Delete">X</button>
      </div>
    </td>
  `;
}

function attachSimpleRowControls(row) {
  row.querySelector(".row-up")?.addEventListener("click", () => {
    const previous = row.previousElementSibling;
    if (previous) row.parentElement.insertBefore(row, previous);
  });

  row.querySelector(".row-down")?.addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) row.parentElement.insertBefore(next, row);
  });

  row.querySelector(".row-delete")?.addEventListener("click", () => {
    if (confirm("Remove this row?")) row.remove();
  });
}

function attachSpellRowControls(mainRow, detailsRow) {
  mainRow.querySelector(".row-up")?.addEventListener("click", () => {
    const previousDetails = mainRow.previousElementSibling;
    const previousMain = previousDetails?.previousElementSibling;

    if (previousMain?.classList.contains("spell-main-row")) {
      const tbody = mainRow.parentElement;
      tbody.insertBefore(mainRow, previousMain);
      tbody.insertBefore(detailsRow, previousMain);
    }
  });

  mainRow.querySelector(".row-down")?.addEventListener("click", () => {
    const nextMain = detailsRow.nextElementSibling;
    const nextDetails = nextMain?.nextElementSibling;

    if (nextMain?.classList.contains("spell-main-row") && nextDetails?.classList.contains("spell-details-row")) {
      const tbody = mainRow.parentElement;
      tbody.insertBefore(nextMain, mainRow);
      tbody.insertBefore(nextDetails, mainRow);
    }
  });

  mainRow.querySelector(".row-delete")?.addEventListener("click", () => {
    if (confirm("Remove this spell?")) {
      detailsRow.remove();
      mainRow.remove();
    }
  });
}

function addWeaponRow(data = {}) {
  const tb = document.getElementById("weaponBody");
  if (!tb) return;

  const tr = document.createElement("tr");
  tr.className = "weapon-row";

  tr.innerHTML =
    tableCell("weapon-name", data.name || "") +
    tableCell("weapon-atk", data.atk || "") +
    tableCell("weapon-damage", data.damage || "") +
    tableCell("weapon-notes", data.notes || "") +
    makeEditCell();

  tb.appendChild(tr);
  attachSimpleRowControls(tr);
}

function resetWeaponRows(rows = DEFAULT_WEAPON_ROWS) {
  const tb = document.getElementById("weaponBody");
  if (!tb) return;

  tb.innerHTML = "";
  rows.forEach(row => addWeaponRow(row));
}

function addSR(data = {}) {
  const tb = document.getElementById("sbody");
  if (!tb) return;

  const spell = {
    level: data.level || "",
    name: data.name || "",
    castTime: data.castTime || "",
    range: data.range || "",
    concentration: data.concentration === true,
    ritual: data.ritual === true,
    material: data.material === true,
    effect: data.effect || "",
    details: data.details || "",
    open: data.open === true
  };

  const mainRow = document.createElement("tr");
  mainRow.className = "spell-main-row";

  const detailsRow = document.createElement("tr");
  detailsRow.className = "spell-details-row";

  mainRow.innerHTML =
    tableCell("spell-level", spell.level) +
    tableCell("spell-name", spell.name) +
    tableCell("spell-cast-time", spell.castTime) +
    tableCell("spell-range", spell.range) +
    `<td style="text-align:center;"><input class="spell-concentration" type="checkbox" ${spell.concentration ? "checked" : ""} /></td>` +
    `<td style="text-align:center;"><input class="spell-ritual" type="checkbox" ${spell.ritual ? "checked" : ""} /></td>` +
    `<td style="text-align:center;"><input class="spell-material" type="checkbox" ${spell.material ? "checked" : ""} /></td>` +
    tableCell("spell-effect", spell.effect) +
    `
      <td class="spell-details-cell">
        <button type="button" class="spell-details-toggle ${spell.open ? "open" : ""}">Details</button>
      </td>
    ` +
    makeEditCell();

  detailsRow.style.display = spell.open ? "" : "none";
  const detailsColspan = document
    .getElementById("spellTable")
    ?.classList.contains("editing")
      ? 10
      : 9;

  detailsRow.innerHTML = `
    <td colspan="${detailsColspan}">
      <div class="spell-details-panel">
        <textarea class="spell-details" placeholder="Full spell rules, upcasting, components, area, duration, reminders...">${safeText(spell.details)}</textarea>
      </div>
    </td>
  `;

  tb.appendChild(mainRow);
  tb.appendChild(detailsRow);

  mainRow.querySelector(".spell-details-toggle").addEventListener("click", event => {
    event.preventDefault();

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const isOpening = detailsRow.style.display === "none";

    detailsRow.style.display = isOpening ? "" : "none";
    event.currentTarget.classList.toggle("open", isOpening);

    requestAnimationFrame(() => {
      window.scrollTo({
        left: scrollX,
        top: scrollY,
        behavior: "auto"
      });
    });
  });

  attachSpellRowControls(mainRow, detailsRow);
}

function resetSpellRows(rows = DEFAULT_SPELL_ROWS) {
  const tb = document.getElementById("sbody");
  if (!tb) return;

  tb.innerHTML = "";
  rows.forEach(row => addSR(row));
}

function toggleTableEditMode(tableId, button) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const isEditing = table.classList.toggle("editing");

  if (tableId === "spellTable") {
    table.querySelectorAll(".spell-details-row td").forEach(cell => {
      cell.colSpan = isEditing ? 10 : 9;
    });
  }

  if (button) {
    button.classList.toggle("editing-active", isEditing);
  }
}

function collectWeaponRows() {
  return Array.from(document.querySelectorAll("#weaponBody .weapon-row")).map(row => ({
    name: row.querySelector(".weapon-name")?.value || "",
    atk: row.querySelector(".weapon-atk")?.value || "",
    damage: row.querySelector(".weapon-damage")?.value || "",
    notes: row.querySelector(".weapon-notes")?.value || ""
  }));
}

function collectSpellRows() {
  const rows = [];
  const mainRows = Array.from(document.querySelectorAll("#sbody .spell-main-row"));

  mainRows.forEach(mainRow => {
    const detailsRow = mainRow.nextElementSibling;

    rows.push({
      level: mainRow.querySelector(".spell-level")?.value || "",
      name: mainRow.querySelector(".spell-name")?.value || "",
      castTime: mainRow.querySelector(".spell-cast-time")?.value || "",
      range: mainRow.querySelector(".spell-range")?.value || "",
      concentration: mainRow.querySelector(".spell-concentration")?.checked || false,
      ritual: mainRow.querySelector(".spell-ritual")?.checked || false,
      material: mainRow.querySelector(".spell-material")?.checked || false,
      effect: mainRow.querySelector(".spell-effect")?.value || "",
      details: detailsRow?.querySelector(".spell-details")?.value || "",
      open: detailsRow?.style.display !== "none"
    });
  });

  return rows;
}

resetWeaponRows();
resetSpellRows();
