// Mythical Blue · Saved Characters overview
// Character cards, overview HP controls, conditions, and summary display.

function normalizeConditionNames(value) {
  const knownConditions = Object.keys(CONDITION_DETAILS);

  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item =>
      knownConditions.find(condition =>
        condition.toLowerCase() === item.toLowerCase()
      ) || item
    )
    .filter((item, index, array) =>
      array.findIndex(other => other.toLowerCase() === item.toLowerCase()) === index
    );
}

function serializeConditionNames(conditions) {
  return normalizeConditionNames(conditions.join(", ")).join(", ");
}

function getCardLiveState(card) {
  const cardHp = card.querySelector(".card-hp");
  const curIn = card.querySelector(".card-hp-cur");
  const maxIn = card.querySelector(".card-hp-max");
  const conditions = Array.from(
    card.querySelectorAll(".card-condition-chip")
  ).map(chip => chip.dataset.condition);

  return {
    id: card.dataset.id,
    hpCurrent: curIn?.value ?? "",
    hpMax: maxIn?.value ?? "",
    tempHp: cardHp?.dataset.temphp ?? "",
    armorClass: card.querySelector(".card-ac-value")?.textContent?.trim() ?? "",
    currentConditions: serializeConditionNames(conditions)
  };
}

function renderCardConditions(card, currentConditions) {
  const chipContainer = card.querySelector(".card-condition-chips");
  if (!chipContainer) return;

  const conditions = normalizeConditionNames(currentConditions);

  chipContainer.innerHTML = conditions.length
    ? conditions.map(condition => `
        <span class="card-condition-chip" data-condition="${escapeHtml(condition)}">
          ${escapeHtml(condition)}
          <button
            type="button"
            class="card-condition-remove"
            data-condition="${escapeHtml(condition)}"
            title="Remove ${escapeHtml(condition)}"
            aria-label="Remove ${escapeHtml(condition)}"
          >×</button>
        </span>
      `).join("")
    : `<span class="card-condition-empty">No conditions</span>`;
}

function buildConditionOptions() {
  return `
    <option value="">Add condition…</option>
    ${Object.keys(CONDITION_DETAILS)
      .map(condition => `<option value="${escapeHtml(condition)}">${escapeHtml(condition)}</option>`)
      .join("")}
  `;
}

async function renderCharacterList() {
  const list = document.getElementById("characterList");

  let characters = [];

  try {
    characters = await characterStorage.listCharacterData();
  } catch (error) {
    console.error(error);
    list.innerHTML = "<p>Could not load saved characters.</p>";
    return;
  }

  if (!characters.length) {
    list.innerHTML = "<p>No saved characters yet.</p>";
    return;
  }

  list.innerHTML = characters.map(character => {
    const hpCur  = parseInt(character.hpCurrent) || 0;
    const hpMax  = parseInt(character.hpMax)     || 0;
    const hpPct  = hpMax > 0 ? Math.round((hpCur / hpMax) * 100) : 0;
    const danger = hpPct > 0 && hpPct <= 50 ? " danger" : "";
    const tempHp = character.tempHp || "";
    return `
    <div class="character-card" data-id="${character.id}">
      <strong>${character.name}</strong><br>
      Armor Class: <span class="card-ac-value">${escapeHtml(character.armorClass || "—")}</span><br>
      Passive Perception: ${escapeHtml(character.passivePerception || "—")}
      <div class="card-condition-editor" data-id="${character.id}">
        <div class="card-condition-label">Current Conditions</div>
        <div class="card-condition-chips"></div>
        <select
          class="card-condition-picker"
          data-id="${character.id}"
          aria-label="Add condition for ${escapeHtml(character.name)}"
        >
          ${buildConditionOptions()}
        </select>
      </div>
      <div class="card-hp" data-id="${character.id}" data-temphp="${tempHp}">
        <div class="card-hp-bwrap">
          <div class="card-hp-bar${danger}" style="width:${hpPct}%"></div>
        </div>
        <div class="card-hp-controls">
          <button class="card-hp-adj" data-id="${character.id}" data-delta="-1" title="Lose 1 HP" aria-label="Lose 1 HP for ${character.name}">−</button>
          <span class="card-hp-readout">
            <input class="card-hp-cur" type="number" min="0"
              value="${hpCur}"
              data-id="${character.id}"
              aria-label="Current HP for ${character.name}">
            <span class="card-hp-slash">/</span>
            <input class="card-hp-max" type="number" min="0"
              value="${hpMax}"
              data-id="${character.id}"
              aria-label="Max HP for ${character.name}">
          </span>
          <button class="card-hp-adj" data-id="${character.id}" data-delta="1" title="Gain 1 HP" aria-label="Gain 1 HP for ${character.name}">+</button>
        </div>
      </div>
    </div>`;
  }).join("");

  characters.forEach(character => {
    const card = list.querySelector(`.character-card[data-id="${character.id}"]`);
    if (card) renderCardConditions(card, character.currentConditions);
  });

  if (list.dataset.hpHandlersBound === "true") return;
  list.dataset.hpHandlersBound = "true";

  list.addEventListener("click", async (event) => {
    const removeConditionButton = event.target.closest(".card-condition-remove");

    if (removeConditionButton) {
      event.stopPropagation();

      const card = removeConditionButton.closest(".character-card");
      if (!card) return;

      const conditionToRemove = removeConditionButton.dataset.condition || "";
      const conditions = normalizeConditionNames(
        getCardLiveState(card).currentConditions
      ).filter(condition =>
        condition.toLowerCase() !== conditionToRemove.toLowerCase()
      );

      renderCardConditions(card, conditions.join(", "));

      const liveState = getCardLiveState(card);
      scheduleCardHPAutoSave(
        liveState.id,
        liveState.hpCurrent,
        liveState.hpMax,
        liveState.tempHp,
        liveState.armorClass,
        liveState.currentConditions
      );

      return;
    }

    const btn = event.target.closest(".card-hp-adj");
    if (btn) {
      event.stopPropagation();
      const id    = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta, 10);
      const cardHp = list.querySelector(`.card-hp[data-id="${id}"]`);
      if (!cardHp) return;
      const curIn = cardHp.querySelector(".card-hp-cur");
      const maxIn = cardHp.querySelector(".card-hp-max");
      let c = parseInt(curIn.value) || 0;
      const m = parseInt(maxIn.value) || 0;
      c = Math.max(0, Math.min(m || 9999, c + delta));
      curIn.value = c;
      updateCardHPBar(cardHp, c, m);
      const liveState = getCardLiveState(cardHp.closest(".character-card"));
      scheduleCardHPAutoSave(
        id,
        String(c),
        maxIn.value,
        cardHp.dataset.temphp,
        liveState.armorClass,
        liveState.currentConditions
      );
      return;
    }

    const card = event.target.closest(".character-card");
    if (
      card &&
      !event.target.closest(".card-hp-controls") &&
      !event.target.closest(".card-condition-editor")
    ) {
      try {
        const result = await characterStorage.loadCharacterData(card.dataset.id);
        loadCharacter(result);
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not load character.");
      }
    }
  });

  list.addEventListener("change", (event) => {
    const picker = event.target.closest(".card-condition-picker");
    if (!picker || !picker.value) return;

    const card = picker.closest(".character-card");
    if (!card) return;

    const liveState = getCardLiveState(card);
    const conditions = normalizeConditionNames(liveState.currentConditions);

    if (!conditions.some(condition =>
      condition.toLowerCase() === picker.value.toLowerCase()
    )) {
      conditions.push(picker.value);
    }

    renderCardConditions(card, conditions.join(", "));
    picker.value = "";

    const updatedState = getCardLiveState(card);
    scheduleCardHPAutoSave(
      updatedState.id,
      updatedState.hpCurrent,
      updatedState.hpMax,
      updatedState.tempHp,
      updatedState.armorClass,
      updatedState.currentConditions
    );
  });

  list.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.classList.contains("card-hp-cur") && !input.classList.contains("card-hp-max")) return;
    const id     = input.dataset.id;
    const cardHp = list.querySelector(`.card-hp[data-id="${id}"]`);
    if (!cardHp) return;
    const curIn = cardHp.querySelector(".card-hp-cur");
    const maxIn = cardHp.querySelector(".card-hp-max");
    const c = parseInt(curIn.value) || 0;
    const m = parseInt(maxIn.value) || 0;
    updateCardHPBar(cardHp, c, m);
    const liveState = getCardLiveState(cardHp.closest(".character-card"));
    scheduleCardHPAutoSave(
      id,
      curIn.value,
      maxIn.value,
      cardHp.dataset.temphp,
      liveState.armorClass,
      liveState.currentConditions
    );
  });
}

function updateCardHPBar(cardHpEl, c, m) {
  const bar  = cardHpEl.querySelector(".card-hp-bar");
  if (!bar) return;
  const pct  = m > 0 ? Math.round((c / m) * 100) : 0;
  bar.style.width = pct + "%";
  bar.classList.toggle("danger", pct > 0 && pct <= 50);
}
