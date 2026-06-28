// Mythical Blue · Proficiencies
// Dynamic proficiency-table rows.

const PROFICIENCY_TYPES = [
  {
    key: "armor",
    label: "Armour",
    placeholder: "Light, medium, heavy, shields…"
  },
  {
    key: "weapons",
    label: "Weapons",
    placeholder: "Simple, martial, hand crossbows…"
  },
  {
    key: "tools",
    label: "Tools",
    placeholder: "Navigator's tools, calligrapher's supplies…"
  },
  {
    key: "other",
    label: "Other",
    placeholder: "Darkvision, swim speed, special training…"
  }
];

function normalizeProficiencyLists(proficiencies = {}) {
  return Object.fromEntries(
    PROFICIENCY_TYPES.map(type => {
      const raw = proficiencies[type.key];
      const values = Array.isArray(raw)
        ? raw
        : (raw === undefined || raw === null ? [] : [raw]);

      const cleaned = values
        .map(value => String(value || ""))
        .filter((value, index) => value.trim() || index === 0);

      return [type.key, cleaned.length ? cleaned : [""]];
    })
  );
}

function proficienciesFromNamedFields(namedFields = {}) {
  const migratedFields = migrateLegacyEquipmentAndProficiencies(namedFields);

  return normalizeProficiencyLists({
    armor: migratedFields.armorProficiencies || "",
    weapons: migratedFields.weaponProficiencies || "",
    tools: migratedFields.toolProficiencies || "",
    other: migratedFields.otherProficiencies || ""
  });
}

function addProficiencyValueRow(typeKey, value = "") {
  const container = document.querySelector(
    `.proficiency-values[data-proficiency-type="${typeKey}"]`
  );

  if (!container) return;

  const row = document.createElement("div");
  row.className = "proficiency-value-row";

  row.innerHTML = `
    <input
      type="text"
      class="proficiency-value"
      value="${escapeHtml(value)}"
      placeholder="${escapeHtml(
        PROFICIENCY_TYPES.find(type => type.key === typeKey)?.placeholder || ""
      )}"
    />
    <button
      type="button"
      class="proficiency-remove-row"
      title="Remove row"
      aria-label="Remove proficiency row"
    >×</button>
  `;

  row.querySelector(".proficiency-remove-row").addEventListener("click", () => {
    const rows = container.querySelectorAll(".proficiency-value-row");

    if (rows.length === 1) {
      row.querySelector(".proficiency-value").value = "";
      return;
    }

    row.remove();
  });

  container.appendChild(row);
}

function renderProficiencyRows(proficiencies = {}) {
  const body = document.getElementById("proficiencyBody");
  if (!body) return;

  const normalized = normalizeProficiencyLists(proficiencies);
  body.innerHTML = "";

  PROFICIENCY_TYPES.forEach(type => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <th class="proficiency-type-cell">
        <div class="proficiency-type-wrap">
          <span class="proficiency-type-label">${type.label}</span>
          <button
            type="button"
            class="proficiency-add-row"
            title="Add ${type.label.toLowerCase()} row"
            aria-label="Add ${type.label.toLowerCase()} proficiency row"
          >+</button>
        </div>
      </th>
      <td class="proficiency-values-cell">
        <div
          class="proficiency-values"
          data-proficiency-type="${type.key}"
        ></div>
      </td>
    `;

    body.appendChild(tr);

    tr.querySelector(".proficiency-add-row").addEventListener("click", () => {
      addProficiencyValueRow(type.key);
    });

    normalized[type.key].forEach(value => {
      addProficiencyValueRow(type.key, value);
    });
  });
}

function collectProficiencyRows() {
  return Object.fromEntries(
    PROFICIENCY_TYPES.map(type => [
      type.key,
      Array.from(
        document.querySelectorAll(
          `.proficiency-values[data-proficiency-type="${type.key}"] .proficiency-value`
        )
      )
        .map(input => input.value.trim())
        .filter(Boolean)
    ])
  );
}
