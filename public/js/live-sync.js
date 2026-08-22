// Mythical Blue · Live character state sync
// BroadcastChannel, polling fallback, and automatic live saves.

const sheetLivePatches = new Map();
const sheetLiveSaveTimers = new Map();
let indexPollTimer = null;
let sheetHPPollTimer = null;
const cardHPAutoSaveTimers = new Map();
const cardLivePatches = new Map();

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
  currentConditions,
  live,
  updatedAt
}) {
  return {
    type: "live-summary-updated",
    id: String(id || ""),
    hpCurrent: hpCurrent ?? "",
    hpMax: hpMax ?? "",
    tempHp: tempHp ?? "",
    armorClass: armorClass ?? "",
    currentConditions: currentConditions ?? "",
    live: live && typeof live === "object" ? live : undefined,
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
    const receivedLive = payload.live || {
      hpCurrent: payload.hpCurrent,
      hpMax: payload.hpMax,
      tempHp: payload.tempHp,
      conditions: normalizeConditionNames(payload.currentConditions),
      updatedAt: payload.updatedAt
    };
    applySheetLiveUpdates({
      summary: { armorClass: payload.armorClass },
      live: receivedLive,
      liveIsPartial: !payload.live
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
  currentConditions = "",
  patch = {}
) {
  cardLivePatches.set(id, {
    ...(cardLivePatches.get(id) || {}),
    ...patch
  });
  clearTimeout(cardHPAutoSaveTimers.get(id));
  cardHPAutoSaveTimers.set(id, setTimeout(async () => {
    cardHPAutoSaveTimers.delete(id);
    const livePatch = cardLivePatches.get(id) || {};
    cardLivePatches.delete(id);

    try {
      const result = await characterStorage.saveCharacterLive({
        id,
        ...livePatch
      });
      const savedLive = result?.live || result;

      if (savedLive?.updatedAt && currentCharacterId === id) {
        loadedCharacterLiveUpdatedAt = savedLive.updatedAt;
      }

      publishLiveUpdate({
        id,
        hpCurrent: savedLive?.hpCurrent ?? hpCurrent,
        hpMax: savedLive?.hpMax ?? hpMax,
        tempHp: savedLive?.tempHp ?? tempHp,
        armorClass,
        currentConditions: serializeConditionNames(savedLive?.conditions || normalizeConditionNames(currentConditions)),
        live: savedLive,
        updatedAt: savedLive?.updatedAt
      });
    } catch (err) {
      cardLivePatches.set(id, {
        ...livePatch,
        ...(cardLivePatches.get(id) || {})
      });
      scheduleCardHPAutoSave(id, hpCurrent, hpMax, tempHp, armorClass, currentConditions);
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
  scheduleHPAutoSave({ hpCurrent: String(c) });
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
  const input = document.activeElement;
  if (input?.id === "hpMaxInput") {
    input.dataset.configuredValue = input.value;
    if (loadedCharacterUpdatedAt) scheduleHPAutoSave({ hpOverride: null });
  } else {
    scheduleHPAutoSave({ hpCurrent: document.getElementById("hpCurrentInput")?.value ?? "" });
  }
}

function scheduleHPAutoSave(patch, requestedCharacterID = "") {
  if (!requestedCharacterID && !loadedCharacterUpdatedAt) return;
  const characterID = requestedCharacterID || currentCharacterId;
  if (!characterID) return;
  const pendingLivePatch = sheetLivePatches.get(characterID) || {};
  if (patch && typeof patch === "object") {
    Object.assign(pendingLivePatch, patch);
  } else if (document.activeElement?.id === "tempHpInput") {
    pendingLivePatch.tempHp = document.activeElement.value;
  }
  sheetLivePatches.set(characterID, pendingLivePatch);
  clearTimeout(sheetLiveSaveTimers.get(characterID));
  const timer = setTimeout(async () => {
    sheetLiveSaveTimers.delete(characterID);
    try {
      const livePatch = sheetLivePatches.get(characterID) || {};
      sheetLivePatches.delete(characterID);

      const result = await characterStorage.saveCharacterLive({
        id: characterID,
        ...livePatch
      });
      const savedLive = result?.live || result;

      if (savedLive?.updatedAt && currentCharacterId === characterID) {
        loadedCharacterLiveUpdatedAt = savedLive.updatedAt;
      }

      publishLiveUpdate({
        id: characterID,
        hpCurrent: savedLive?.hpCurrent ?? document.getElementById("hpCurrentInput")?.value ?? "",
        hpMax: savedLive?.hpMax ?? document.getElementById("hpMaxInput")?.value ?? "",
        tempHp: savedLive?.tempHp ?? document.getElementById("tempHpInput")?.value ?? "",
        armorClass: currentCharacterId === characterID
          ? document.querySelector('[data-field="armorClass"]')?.value ?? ""
          : "",
        currentConditions: serializeConditionNames(savedLive?.conditions || getSelectedConditions()),
        live: savedLive,
        updatedAt: savedLive?.updatedAt
      });
    } catch (err) {
      sheetLivePatches.set(characterID, {
        ...livePatch,
        ...(sheetLivePatches.get(characterID) || {})
      });
      scheduleHPAutoSave({}, characterID);
      console.warn("HP auto-save failed:", err.message);
    }
  }, 800);
  sheetLiveSaveTimers.set(characterID, timer);
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
  if (sheetLiveSaveTimers.has(currentCharacterId)) return;

  const live = character.live || {};
  const remoteUpdatedAt = live.updatedAt;
  // Skip if we already have this version or newer
  if (remoteUpdatedAt && loadedCharacterLiveUpdatedAt &&
      remoteUpdatedAt <= loadedCharacterLiveUpdatedAt) return;

  const curIn = document.getElementById("hpCurrentInput");
  const maxIn = document.getElementById("hpMaxInput");
  const tmpIn = document.getElementById("tempHpInput");

  if (curIn && document.activeElement !== curIn) {
    curIn.value = live.hpCurrent ?? "";
  }
  if (maxIn && document.activeElement !== maxIn) {
    maxIn.value = live.hpMax ?? "";
  }
  if (tmpIn && document.activeElement !== tmpIn) {
    tmpIn.value = live.tempHp ?? "";
  }

  const armorClassInput = document.querySelector('[data-field="armorClass"]');
  const conditionsInput = document.getElementById("currentConditionsInput");

  if (
    Array.isArray(live.activeArmorClassModifiers) &&
    typeof applyActiveArmorClassModifiers === "function"
  ) {
    applyActiveArmorClassModifiers(live.activeArmorClassModifiers);
  }

  if (conditionsInput) {
    conditionsInput.value = serializeConditionNames(live.conditions || []);
    focusedCondition = "";
    renderSelectedConditions();
  }

  // Only advance our timestamp if none of the directly editable fields are focused
  if (document.activeElement !== curIn &&
      document.activeElement !== maxIn &&
      document.activeElement !== tmpIn &&
      document.activeElement !== armorClassInput) {
    loadedCharacterLiveUpdatedAt = remoteUpdatedAt;
  }

  if (!character.liveIsPartial) applyLiveState(live);
  updateHPBar();
}

function applyLiveState(live = {}) {
  const inspiration = document.querySelector(".insp");
  if (inspiration) inspiration.textContent = live.inspiration === true ? "✦" : "○";

  const setCount = (selector, count) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.classList.toggle("on", index < Number(count || 0));
    });
  };
  setCount(".dsbox .svdie:not(.fail)", live.deathSaves?.successes);
  setCount(".dsbox .svdie.fail", live.deathSaves?.failures);
  setCount(".exhaustion-row .svdie", live.exhaustionLevel);

  const spentInput = document.querySelector('[data-field="hitDiceSpent"]');
  if (spentInput && live.hitDiceSpent && typeof live.hitDiceSpent === "object") {
    spentInput.value = Object.entries(live.hitDiceSpent)
      .map(([die, count]) => die === "default" ? count : `${die}: ${count}`)
      .join(", ");
  } else if (spentInput) {
    spentInput.value = "";
  }

  const conditionsInput = document.getElementById("currentConditionsInput");
  if (conditionsInput && Array.isArray(live.conditions)) {
    conditionsInput.value = serializeConditionNames(live.conditions);
  }
}

function collectHitDiceSpent() {
  const value = document.querySelector('[data-field="hitDiceSpent"]')?.value.trim() || "";
  if (!value) return {};
  const entries = value.split(",").map(part => part.trim()).filter(Boolean).map(part => {
    if (!part.includes(":")) return ["default", part];
    const [die, count] = part.split(":").map(item => item.trim());
    const parsed = Number.parseInt(count, 10);
    return [die, Number.isFinite(parsed) ? parsed : null];
  });
  return Object.fromEntries(entries.filter(([die, count]) => die && count !== null));
}

document.addEventListener("click", event => {
  if (!currentCharacterId || !event.target.closest(".sheet")) return;
  if (event.target.closest(".insp")) {
    scheduleHPAutoSave({ inspiration: event.target.closest(".insp").textContent.trim() === "✦" });
  } else if (event.target.closest(".dsbox .svdie")) {
    scheduleHPAutoSave({
      deathSaves: {
        successes: document.querySelectorAll(".dsbox .svdie:not(.fail).on").length,
        failures: document.querySelectorAll(".dsbox .svdie.fail.on").length
      }
    });
  } else if (event.target.closest(".exhaustion-row .svdie")) {
    scheduleHPAutoSave({ exhaustionLevel: document.querySelectorAll(".exhaustion-row .svdie.on").length });
  }
});

document.addEventListener("input", event => {
  if (event.target.matches('[data-field="hitDiceSpent"]')) {
    scheduleHPAutoSave({ hitDiceSpent: collectHitDiceSpent() });
  }
});

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
