// Mythical Blue · Live character status sync
// BroadcastChannel, polling fallback, and automatic status saves.

let hpAutoSaveTimer = null;
let indexPollTimer = null;
let sheetHPPollTimer = null;
const cardHPAutoSaveTimers = new Map();

const HP_SYNC_CHANNEL_NAME = "mythical-blue-hp-sync-v1";
const HP_SYNC_STORAGE_KEY = "mythicalBlueHPBroadcastV1";
const hpSyncChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(HP_SYNC_CHANNEL_NAME)
    : null;

function createLiveUpdatePayload({
  id,
  hpCurrent,
  hpMax,
  tempHp,
  armorClass,
  armorClassState,
  currentConditions,
  updatedAt
}) {
  return {
    type: "live-summary-updated",
    id: String(id || ""),
    hpCurrent: hpCurrent ?? "",
    hpMax: hpMax ?? "",
    tempHp: tempHp ?? "",
    armorClass: armorClass ?? "",
    armorClassState:
      armorClassState && typeof armorClassState === "object"
        ? armorClassState
        : undefined,
    currentConditions: currentConditions ?? "",
    updatedAt: updatedAt || new Date().toISOString(),
    nonce:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
  };
}

function publishLiveUpdate(update) {
  const payload = createLiveUpdatePayload(update);

  try {
    hpSyncChannel?.postMessage(payload);
  } catch (error) {
    console.warn("Could not broadcast live summary update:", error);
  }

  // Fallback for browsers that do not support BroadcastChannel.
  // The storage event fires in other tabs on the same origin.
  try {
    localStorage.setItem(HP_SYNC_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Could not publish live summary update through localStorage:", error);
  }
}

function receiveLiveUpdate(payload) {
  if (!payload || payload.type !== "live-summary-updated" || !payload.id) return;

  applyIndexLiveUpdates([payload]);

  if (currentCharacterId === payload.id) {
    applySheetLiveUpdates({
      updatedAt: payload.updatedAt,
      summary: {
        hpCurrent: payload.hpCurrent,
        hpMax: payload.hpMax,
        tempHp: payload.tempHp,
        armorClass: payload.armorClass,
        currentConditions: payload.currentConditions
      },
      customLists: {
        armorClass: payload.armorClassState
      }
    });
  }
}

hpSyncChannel?.addEventListener("message", event => {
  receiveLiveUpdate(event.data);
});

window.addEventListener("storage", event => {
  if (event.key !== HP_SYNC_STORAGE_KEY || !event.newValue) return;

  try {
    receiveLiveUpdate(JSON.parse(event.newValue));
  } catch (error) {
    console.warn("Could not parse live summary sync event:", error);
  }
});

function scheduleCardHPAutoSave(
  id,
  hpCurrent,
  hpMax,
  tempHp,
  armorClass = "",
  currentConditions = ""
) {
  clearTimeout(cardHPAutoSaveTimers.get(id));
  cardHPAutoSaveTimers.set(id, setTimeout(async () => {
    cardHPAutoSaveTimers.delete(id);

    try {
      const result = await characterStorage.saveCharacterStatus({
        id,
        hpCurrent,
        hpMax,
        tempHp,
        armorClass,
        currentConditions
      });

      if (result?.updatedAt && currentCharacterId === id) {
        loadedCharacterUpdatedAt = result.updatedAt;
      }

      publishLiveUpdate({
        id,
        hpCurrent,
        hpMax,
        tempHp,
        armorClass,
        currentConditions,
        updatedAt: result?.updatedAt
      });
    } catch (err) {
      console.warn("Card live-summary auto-save failed:", err.message);
    }
  }, 800));
}

function adjustHP(delta) {
  const cur = document.getElementById("hpCurrentInput");
  const max = document.getElementById("hpMaxInput");
  if (!cur || !max) return;
  let c = parseInt(cur.value) || 0;
  let m = parseInt(max.value) || 0;
  c = Math.max(0, Math.min(m || 9999, c + delta));
  cur.value = c;
  updateHPBar();
  scheduleHPAutoSave();
}

function updateHPBar() {
  const bar = document.getElementById("hp-bar");
  const cur = document.getElementById("hpCurrentInput");
  const max = document.getElementById("hpMaxInput");
  if (!bar || !cur || !max) return;
  const c = parseInt(cur.value) || 0;
  const m = parseInt(max.value) || 0;
  const pct = m > 0 ? Math.round((c / m) * 100) : 0;
  bar.style.width = pct + "%";
  // green above 50 %, red at 50 % and below
  bar.classList.toggle("danger", pct > 0 && pct <= 50);
}

function onHPInput() {
  updateHPBar();
  scheduleHPAutoSave();
}

function scheduleHPAutoSave() {
  clearTimeout(hpAutoSaveTimer);
  hpAutoSaveTimer = setTimeout(async () => {
    hpAutoSaveTimer = null;
    if (!currentCharacterId) return;
    try {
      const liveState = {
        id: currentCharacterId,
        hpCurrent: document.getElementById("hpCurrentInput")?.value ?? "",
        hpMax: document.getElementById("hpMaxInput")?.value ?? "",
        tempHp: document.getElementById("tempHpInput")?.value ?? "",
        armorClass:
          document.querySelector('[data-field="armorClass"]')?.value ?? "",
        armorClassState:
          typeof collectArmorClassState === "function"
            ? collectArmorClassState()
            : undefined,
        currentConditions:
          document.getElementById("currentConditionsInput")?.value ?? ""
      };

      const result = await characterStorage.saveCharacterStatus(liveState);

      if (result?.updatedAt) loadedCharacterUpdatedAt = result.updatedAt;

      publishLiveUpdate({
        ...liveState,
        updatedAt: result?.updatedAt
      });
    } catch (err) {
      console.warn("HP auto-save failed:", err.message);
    }
  }, 800);
}

// ─── INDEX PAGE POLLING ───────────────────────────────────────────────────────

function startIndexPolling() {
  stopIndexPolling();
  scheduleIndexPoll();
}

function stopIndexPolling() {
  clearTimeout(indexPollTimer);
  indexPollTimer = null;
}

function scheduleIndexPoll() {
  const ms = document.hidden ? 30000 : 5000;
  indexPollTimer = setTimeout(async () => {
    await pollIndexHP();
    if (indexPollTimer !== null) scheduleIndexPoll();
  }, ms);
}

async function pollIndexHP() {
  try {
    const characters = await characterStorage.listCharacterData();
    applyIndexLiveUpdates(characters);
  } catch {
    // silent — wait for next poll
  }
}

function applyIndexLiveUpdates(characters) {
  const list = document.getElementById("characterList");
  if (!list) return;

  for (const ch of characters) {
    const cardHp = list.querySelector(`.card-hp[data-id="${ch.id}"]`);
    if (!cardHp) continue;

    const curIn = cardHp.querySelector(".card-hp-cur");
    const maxIn = cardHp.querySelector(".card-hp-max");
    if (!curIn || !maxIn) continue;

    // Skip if user is actively editing this card's HP
    if (document.activeElement === curIn || document.activeElement === maxIn) continue;

    // Skip if a pending auto-save timer exists (user just made a change)
    if (cardHPAutoSaveTimers.has(ch.id)) continue;

    const newCur = String(ch.hpCurrent || "0");
    const newMax = String(ch.hpMax     || "0");

    if (curIn.value !== newCur || maxIn.value !== newMax) {
      curIn.value = newCur;
      maxIn.value = newMax;
      updateCardHPBar(cardHp, parseInt(newCur) || 0, parseInt(newMax) || 0);
    }

    // Keep tempHp data attribute in sync for future auto-saves
    if (ch.tempHp !== undefined) {
      cardHp.dataset.temphp = ch.tempHp;
    }

    const card = cardHp.closest(".character-card");
    if (!card) continue;

    const armorClass = String(ch.armorClass || "—");
    const acValue = card.querySelector(".card-ac-value");

    if (acValue && acValue.textContent !== armorClass) {
      acValue.textContent = armorClass;
    }

    if (!card.querySelector(".card-condition-picker:focus")) {
      renderCardConditions(card, ch.currentConditions || "");
    }
  }
}

// ─── CHARACTER SHEET HP POLLING ───────────────────────────────────────────────

function startSheetHPPolling() {
  stopSheetHPPolling();
  scheduleSheetHPPoll();
}

function stopSheetHPPolling() {
  clearTimeout(sheetHPPollTimer);
  sheetHPPollTimer = null;
}

function scheduleSheetHPPoll() {
  const ms = document.hidden ? 30000 : 5000;
  sheetHPPollTimer = setTimeout(async () => {
    await pollSheetHP();
    if (sheetHPPollTimer !== null) scheduleSheetHPPoll();
  }, ms);
}

async function pollSheetHP() {
  if (!currentCharacterId) return;
  try {
    const character = await characterStorage.loadCharacterData(currentCharacterId);
    applySheetLiveUpdates(character);
  } catch {
    // silent — wait for next poll
  }
}

function applySheetLiveUpdates(character) {
  // Don't overwrite while a local auto-save is pending
  if (hpAutoSaveTimer !== null) return;

  const remoteUpdatedAt = character.updatedAt;
  // Skip if we already have this version or newer
  if (remoteUpdatedAt && loadedCharacterUpdatedAt &&
      remoteUpdatedAt <= loadedCharacterUpdatedAt) return;

  const curIn = document.getElementById("hpCurrentInput");
  const maxIn = document.getElementById("hpMaxInput");
  const tmpIn = document.getElementById("tempHpInput");

  if (curIn && document.activeElement !== curIn) {
    curIn.value = character.summary?.hpCurrent ?? "";
  }
  if (maxIn && document.activeElement !== maxIn) {
    maxIn.value = character.summary?.hpMax ?? "";
  }
  if (tmpIn && document.activeElement !== tmpIn) {
    tmpIn.value = character.summary?.tempHp ?? "";
  }

  const armorClassInput = document.querySelector('[data-field="armorClass"]');
  const conditionsInput = document.getElementById("currentConditionsInput");

  const remoteArmorClassState = character.customLists?.armorClass;

  if (
    remoteArmorClassState &&
    typeof renderArmorClassState === "function"
  ) {
    renderArmorClassState(
      remoteArmorClassState,
      character.summary?.armorClass ?? "",
      { scheduleSave: false }
    );
  } else if (armorClassInput && document.activeElement !== armorClassInput) {
    armorClassInput.value = character.summary?.armorClass ?? "";
  }

  if (conditionsInput) {
    conditionsInput.value = character.summary?.currentConditions ?? "";
    focusedCondition = "";
    renderSelectedConditions();
  }

  // Only advance our timestamp if none of the directly editable fields are focused
  if (document.activeElement !== curIn &&
      document.activeElement !== maxIn &&
      document.activeElement !== tmpIn &&
      document.activeElement !== armorClassInput) {
    loadedCharacterUpdatedAt = remoteUpdatedAt;
  }

  updateHPBar();
}

// ─── PAGE VISIBILITY ──────────────────────────────────────────────────────────

document.addEventListener("visibilitychange", () => {
  if (indexPollTimer !== null) {
    stopIndexPolling();
    startIndexPolling();
  }
  if (sheetHPPollTimer !== null) {
    stopSheetHPPolling();
    startSheetHPPolling();
  }
});
