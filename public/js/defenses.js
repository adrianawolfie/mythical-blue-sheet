// Mythical Blue · Defenses
// Dynamic rows for damage resistances, immunities, and vulnerabilities.

const DEFENSE_TYPES = [
  {
    key: "resistances",
    label: "Resistances",
    placeholder: "Cold, fire, poison…"
  },
  {
    key: "immunities",
    label: "Immunities",
    placeholder: "Poison damage, Charmed condition…"
  },
  {
    key: "vulnerabilities",
    label: "Vulnerabilities",
    placeholder: "Radiant, silvered weapons…"
  }
];

function normalizeDefenseLists(defenses = {}) {
  return Object.fromEntries(
    DEFENSE_TYPES.map(type => {
      const raw = defenses[type.key];
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

function addDefenseValueRow(typeKey, value = "") {
  const container = document.querySelector(
    `.defense-values[data-defense-type="${typeKey}"]`
  );

  if (!container) return;

  const row = document.createElement("div");
  row.className = "proficiency-value-row defense-value-row";
  const type = DEFENSE_TYPES.find(entry => entry.key === typeKey);

  row.innerHTML = `
    <input
      type="text"
      class="proficiency-value defense-value"
      value="${escapeHtml(value)}"
      placeholder="${escapeHtml(type?.placeholder || "")}"
    />
    <button
      type="button"
      class="proficiency-remove-row defense-remove-row"
      title="Remove row"
      aria-label="Remove ${escapeHtml(type?.label || "defense")} row"
    >×</button>
  `;

  row.querySelector(".defense-remove-row").addEventListener("click", () => {
    const rows = container.querySelectorAll(".defense-value-row");

    if (rows.length === 1) {
      row.querySelector(".defense-value").value = "";
      return;
    }

    row.remove();
  });

  container.appendChild(row);
}

function renderDefenseRows(defenses = {}) {
  const body = document.getElementById("defenseBody");
  if (!body) return;

  const normalized = normalizeDefenseLists(defenses);
  body.innerHTML = "";

  DEFENSE_TYPES.forEach(type => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <th class="proficiency-type-cell defense-type-cell">
        <div class="proficiency-type-wrap">
          <span class="proficiency-type-label">${type.label}</span>
          <button
            type="button"
            class="proficiency-add-row defense-add-row"
            title="Add ${type.label.toLowerCase()} row"
            aria-label="Add ${type.label.toLowerCase()} row"
          >+</button>
        </div>
      </th>
      <td class="proficiency-values-cell">
        <div
          class="proficiency-values defense-values"
          data-defense-type="${type.key}"
        ></div>
      </td>
    `;

    body.appendChild(tr);

    tr.querySelector(".defense-add-row").addEventListener("click", () => {
      addDefenseValueRow(type.key);
    });

    normalized[type.key].forEach(value => addDefenseValueRow(type.key, value));
  });
}

function collectDefenseRows() {
  return Object.fromEntries(
    DEFENSE_TYPES.map(type => [
      type.key,
      Array.from(
        document.querySelectorAll(
          `.defense-values[data-defense-type="${type.key}"] .defense-value`
        )
      )
        .map(input => input.value.trim())
        .filter(Boolean)
    ])
  );
}
