// Mythical Blue · Condition controls
// Character-sheet condition picker, chips, and explanations.

let focusedCondition = "";

function populateConditionDropdown() {
  const dropdown = document.getElementById("conditionPicker");
  if (!dropdown) return;

  dropdown.innerHTML = `
    <option value="">Add condition…</option>
    ${Object.keys(CONDITION_DETAILS)
      .map(condition => `<option value="${condition}">${condition}</option>`)
      .join("")}
  `;
}

function getSelectedConditions() {
  const input = document.getElementById("currentConditionsInput");
  if (!input || !input.value.trim()) return [];

  const knownConditions = Object.keys(CONDITION_DETAILS);

  return input.value
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(value =>
      knownConditions.find(condition =>
        condition.toLowerCase() === value.toLowerCase()
      ) || value
    )
    .filter((value, index, array) =>
      array.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index
    );
}

function setSelectedConditions(conditions) {
  const input = document.getElementById("currentConditionsInput");
  if (!input) return;

  input.value = conditions.join(", ");
}

function addSelectedCondition(condition) {
  if (!condition) return;

  const conditions = getSelectedConditions();

  if (!conditions.some(item => item.toLowerCase() === condition.toLowerCase())) {
    conditions.push(condition);
    setSelectedConditions(conditions);
  }

  focusedCondition = condition;
  renderSelectedConditions();
  scheduleHPAutoSave();
}

function removeSelectedCondition(condition, event) {
  if (event) event.stopPropagation();

  const conditions = getSelectedConditions().filter(
    item => item.toLowerCase() !== condition.toLowerCase()
  );

  setSelectedConditions(conditions);

  if (focusedCondition.toLowerCase() === condition.toLowerCase()) {
    focusedCondition = conditions[0] || "";
  }

  renderSelectedConditions();
  scheduleHPAutoSave();
}

function showConditionExplanation(condition) {
  focusedCondition = condition;
  renderSelectedConditions();
}

function renderSelectedConditions() {
  const chips = document.getElementById("activeConditions");
  const display = document.getElementById("currentConditionsDisplay");
  const explanation = document.getElementById("conditionExplanation");
  const conditions = getSelectedConditions();

  if (!chips || !display || !explanation) return;

  if (conditions.length) {
    display.style.display = "none";
  } else {
    display.style.display = "flex";
    display.textContent = "Add condition…";
  }

  chips.innerHTML = conditions.map(condition => `
    <button
      type="button"
      class="condition-chip ${focusedCondition === condition ? "active" : ""}"
      onclick="showConditionExplanation('${condition}')"
    >
      ${condition}
      <span
        class="condition-chip-remove"
        onclick="removeSelectedCondition('${condition}', event)"
        aria-label="Remove ${condition}"
      >×</span>
    </button>
  `).join("");

  if (!focusedCondition || !conditions.includes(focusedCondition)) {
    focusedCondition = conditions[0] || "";
  }

  if (!focusedCondition || !CONDITION_DETAILS[focusedCondition]) {
    explanation.classList.remove("on");
    explanation.innerHTML = "";
    return;
  }

  explanation.innerHTML = `
    <strong>${focusedCondition}</strong>
    <ul>
      ${CONDITION_DETAILS[focusedCondition]
        .map(detail => `<li>${detail}</li>`)
        .join("")}
    </ul>
  `;
  explanation.classList.add("on");
}
