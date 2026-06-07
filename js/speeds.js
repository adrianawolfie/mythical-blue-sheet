// Mythical Blue · Movement speeds
// Optional swimming, climbing, flying, burrowing, and custom movement speeds.

const EXTRA_SPEED_TYPES = [
  "Swimming",
  "Climbing",
  "Flying",
  "Burrowing",
  "Other"
];

function addExtraSpeedRow(data = {}) {
  const container = document.getElementById("extraSpeedRows");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "extra-speed-row";

  const speedType = String(data.type || "Swimming");
  const speedValue = String(data.value || "");

  row.innerHTML = `
    <select class="extra-speed-type" aria-label="Movement speed type">
      ${EXTRA_SPEED_TYPES.map(type => `
        <option value="${escapeHtml(type)}" ${type === speedType ? "selected" : ""}>
          ${escapeHtml(type)}
        </option>
      `).join("")}
    </select>

    <input
      class="extra-speed-custom-type"
      type="text"
      placeholder="Other speed…"
      value="${escapeHtml(data.customType || "")}"
      aria-label="Custom movement speed type"
      ${speedType === "Other" ? "" : "hidden"}
    />

    <input
      class="extra-speed-value"
      type="text"
      inputmode="numeric"
      placeholder="30"
      value="${escapeHtml(speedValue)}"
      aria-label="${escapeHtml(speedType)} speed"
    />

    <span class="extra-speed-unit">ft</span>

    <button
      type="button"
      class="extra-speed-remove"
      title="Remove movement speed"
      aria-label="Remove movement speed"
    >×</button>
  `;

  const typeSelect = row.querySelector(".extra-speed-type");
  const customTypeInput = row.querySelector(".extra-speed-custom-type");

  function syncCustomTypeMode() {
    const isOther = typeSelect.value === "Other";

    typeSelect.hidden = isOther;
    customTypeInput.hidden = !isOther;

    if (!isOther) {
      customTypeInput.value = "";
    }
  }

  typeSelect.addEventListener("change", () => {
    syncCustomTypeMode();

    if (typeSelect.value === "Other") {
      customTypeInput.focus();
    }
  });

  customTypeInput.addEventListener("blur", () => {
    if (!customTypeInput.value.trim()) {
      typeSelect.value = "Other";
      typeSelect.hidden = false;
      customTypeInput.hidden = true;
    }
  });

  syncCustomTypeMode();

  row.querySelector(".extra-speed-remove").addEventListener("click", () => {
    row.remove();
  });

  container.appendChild(row);
}

function renderExtraSpeedRows(speeds = []) {
  const container = document.getElementById("extraSpeedRows");
  if (!container) return;

  container.innerHTML = "";

  (Array.isArray(speeds) ? speeds : []).forEach(speed => {
    addExtraSpeedRow(speed);
  });
}

function collectExtraSpeedRows() {
  return Array.from(
    document.querySelectorAll("#extraSpeedRows .extra-speed-row")
  )
    .map(row => {
      const type = row.querySelector(".extra-speed-type")?.value || "Other";

      return {
        type,
        customType:
          type === "Other"
            ? row.querySelector(".extra-speed-custom-type")?.value.trim() || ""
            : "",
        value: row.querySelector(".extra-speed-value")?.value.trim() || ""
      };
    })
    .filter(speed => speed.value);
}
