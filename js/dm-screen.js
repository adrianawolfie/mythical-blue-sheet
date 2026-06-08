// Mythical Blue · DM screen initiative tracker
// Player rows stay connected to live character summaries. SRD NPCs keep an inline statblock reference.

(() => {
  const DM_STATE_KEY = "mythicalBlueDMTrackerV1";
  const SYNC_CHANNEL_NAME = "mythical-blue-hp-sync-v1";
  const SYNC_STORAGE_KEY = "mythicalBlueHPBroadcastV1";
  const STATBLOCK_LIBRARY_URL = "data/srd-statblocks.json";
  const SAVE_DELAY = 550;
  const POLL_DELAY = 5000;
  const CUSTOM_CONDITION_VALUE = "__custom__";

  let playerCharacters = [];
  let statblockLibrary = [];
  let state = loadTrackerState();
  let saveTimers = new Map();
  let pollTimer = null;
  const focusedConditions = new Map();
  const expandedStatblocks = new Set();

  const syncChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(SYNC_CHANNEL_NAME)
    : null;

  function createId(prefix = "npc") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function loadTrackerState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DM_STATE_KEY) || "{}");
      return {
        round: Math.max(1, Number(parsed.round) || 1),
        activeId: String(parsed.activeId || ""),
        playerInitiatives: parsed.playerInitiatives && typeof parsed.playerInitiatives === "object"
          ? parsed.playerInitiatives
          : {},
        playerConcentration: parsed.playerConcentration && typeof parsed.playerConcentration === "object"
          ? parsed.playerConcentration
          : {},
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs : []
      };
    } catch {
      return { round: 1, activeId: "", playerInitiatives: {}, playerConcentration: {}, npcs: [] };
    }
  }

  function persistTrackerState() {
    localStorage.setItem(DM_STATE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function numericInitiative(value) {
    const parsed = Number.parseFloat(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  }

  function numericHp(value) {
    const parsed = Number.parseFloat(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeConditionNames(value) {
    const knownConditions = Object.keys(window.CONDITION_DETAILS || {});
    return String(value || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => knownConditions.find(condition => condition.toLowerCase() === item.toLowerCase()) || item)
      .filter((item, index, array) =>
        array.findIndex(other => other.toLowerCase() === item.toLowerCase()) === index
      );
  }

  function serializeConditionNames(conditions) {
    return normalizeConditionNames(conditions.join(", ")).join(", ");
  }

  function getStatblockById(id) {
    return statblockLibrary.find(statblock => statblock.id === id) || null;
  }

  function normalizeNpc(npc) {
    return {
      id: String(npc.id || createId()),
      name: String(npc.name || "New NPC"),
      initiative: String(npc.initiative ?? ""),
      hpCurrent: String(npc.hpCurrent ?? ""),
      hpMax: String(npc.hpMax ?? ""),
      armorClass: String(npc.armorClass ?? ""),
      currentConditions: serializeConditionNames(normalizeConditionNames(npc.currentConditions)),
      concentrating: Boolean(npc.concentrating),
      statblockId: String(npc.statblockId || ""),
      source: String(npc.source || "")
    };
  }

  function getCombatants() {
    const players = playerCharacters.map(character => ({
      id: character.id,
      type: "player",
      name: character.name || "Unnamed Character",
      initiative: String(state.playerInitiatives[character.id] ?? ""),
      hpCurrent: String(character.hpCurrent ?? ""),
      hpMax: String(character.hpMax ?? ""),
      armorClass: String(character.armorClass ?? ""),
      currentConditions: serializeConditionNames(normalizeConditionNames(character.currentConditions)),
      concentrating: Boolean(state.playerConcentration[character.id]),
      statblockId: "",
      source: ""
    }));

    const npcs = state.npcs.map(normalizeNpc).map(npc => ({ ...npc, type: "npc" }));

    return [...players, ...npcs].sort((a, b) => {
      const aInitiative = numericInitiative(a.initiative);
      const bInitiative = numericInitiative(b.initiative);
      if (aInitiative !== bInitiative) {
        if (aInitiative === Number.NEGATIVE_INFINITY) return 1;
        if (bInitiative === Number.NEGATIVE_INFINITY) return -1;
        return bInitiative - aInitiative;
      }
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
    });
  }

  function rowInput({ className, field, value, label, type = "text", inputmode = "text" }) {
    return `<input class="${className}" data-field="${field}" type="${type}" inputmode="${inputmode}" value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}">`;
  }

  function hpBarMarkup(combatant) {
    const hpCurrent = numericHp(combatant.hpCurrent);
    const hpMax = numericHp(combatant.hpMax);
    const pct = hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpCurrent / hpMax) * 100))) : 0;
    const danger = pct > 0 && pct <= 50 ? " danger" : "";
    return `<div class="combatant-hp-bwrap" aria-hidden="true"><div class="combatant-hp-bar${danger}" style="width:${pct}%"></div></div>`;
  }

  function conditionOptionsMarkup() {
    return `<option value="">Add condition…</option>${Object.keys(window.CONDITION_DETAILS || {})
      .map(condition => `<option value="${escapeHtml(condition)}">${escapeHtml(condition)}</option>`)
      .join("")}<option value="${CUSTOM_CONDITION_VALUE}">Custom condition…</option>`;
  }

  function conditionInfoMarkup(combatant) {
    const focused = focusedConditions.get(combatant.id);
    if (!focused) return "";
    const standardDetails = window.CONDITION_DETAILS?.[focused];
    const details = standardDetails?.length
      ? `<ul>${standardDetails.map(detail => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>`
      : `<p>Custom condition. Add campaign-specific details to your notes.</p>`;
    return `<aside class="combatant-condition-info" aria-live="polite"><div class="combatant-condition-info-header"><strong>${escapeHtml(focused)}</strong><button type="button" data-action="close-condition-info" aria-label="Close ${escapeHtml(focused)} details">×</button></div>${details}</aside>`;
  }

  function conditionEditorMarkup(combatant) {
    const conditions = normalizeConditionNames(combatant.currentConditions);
    return `<div class="combatant-condition-chips">${conditions.length
      ? conditions.map(condition => `<span class="combatant-condition-chip${focusedConditions.get(combatant.id) === condition ? " active" : ""}"><button type="button" class="combatant-condition-open" data-action="show-condition" data-condition="${escapeHtml(condition)}">${escapeHtml(condition)}</button><button type="button" class="combatant-condition-remove" data-action="remove-condition" data-condition="${escapeHtml(condition)}" aria-label="Remove ${escapeHtml(condition)}">×</button></span>`).join("")
      : `<span class="combatant-condition-empty">No conditions</span>`}</div><select class="combatant-condition-picker" data-action="add-condition" aria-label="Add condition for ${escapeHtml(combatant.name)}">${conditionOptionsMarkup()}</select>${conditionInfoMarkup(combatant)}`;
  }

  function statblockSummaryMarkup(statblock) {
    if (!statblock) return "";
    return `<div class="statblock-summary-chips"><span>AC ${escapeHtml(statblock.armorClass)}</span><span>HP ${escapeHtml(statblock.hp)}${statblock.hpFormula ? ` (${escapeHtml(statblock.hpFormula)})` : ""}</span><span>CR ${escapeHtml(statblock.challengeRating)}</span><span>${escapeHtml(statblock.size)} ${escapeHtml(statblock.type)}</span></div>`;
  }

  const STATBLOCK_SECTION_HEADINGS = ["Traits", "Actions", "Bonus Actions", "Reactions", "Legendary Actions"];
  const STATBLOCK_META_PREFIXES = ["Skills", "Gear", "Senses", "Languages", "CR", "Resistances", "Immunities", "Vulnerabilities"];

  function normalizeStatblockLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function splitStatblockEntries(text) {
    const clean = normalizeStatblockLine(text);
    if (!clean) return [];
    const matcher = /(?:^|\s)([A-Z][A-Za-z0-9’'()\/,+ -]{1,84}\.)\s/g;
    const markers = [];
    let match;
    while ((match = matcher.exec(clean))) markers.push({ start: match.index + (match[0].startsWith(" ") ? 1 : 0), label: match[1] });
    if (!markers.length) return [{ title: "", text: clean }];
    const entries = [];
    if (markers[0].start > 0) entries.push({ title: "", text: clean.slice(0, markers[0].start).trim() });
    markers.forEach((marker, index) => {
      const end = markers[index + 1]?.start ?? clean.length;
      const chunk = clean.slice(marker.start, end).trim();
      const title = marker.label.slice(0, -1);
      entries.push({ title, text: chunk.slice(marker.label.length).trim() });
    });
    return entries.filter(entry => entry.title || entry.text);
  }

  function parseStructuredStatblock(statblock) {
    const lines = String(statblock.text || "").split(/\r?\n/).map(normalizeStatblockLine).filter(Boolean);
    const firstSectionIndex = lines.findIndex(line => STATBLOCK_SECTION_HEADINGS.includes(line));
    const preamble = lines.slice(0, firstSectionIndex < 0 ? lines.length : firstSectionIndex);
    const abilityText = preamble.join(" ").replace(/MOD SAVE/g, " ");
    const abilityRegex = /(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\s*([+−-]\d+)(?:\s+([+−-]\d+))?/g;
    const abilities = [];
    let abilityMatch;
    while ((abilityMatch = abilityRegex.exec(abilityText))) {
      abilities.push({ name: abilityMatch[1].toUpperCase(), score: abilityMatch[2], modifier: abilityMatch[3].replace("−", "-"), save: (abilityMatch[4] || abilityMatch[3]).replace("−", "-") });
    }

    const metadata = [];
    let currentMeta = null;
    const firstMeta = preamble.findIndex(line => STATBLOCK_META_PREFIXES.some(prefix => line.startsWith(prefix + " ") || line === prefix));
    if (firstMeta >= 0) {
      preamble.slice(firstMeta).forEach(line => {
        const prefix = STATBLOCK_META_PREFIXES.find(item => line.startsWith(item + " ") || line === item);
        if (prefix) {
          currentMeta = { label: prefix, value: line.slice(prefix.length).trim() };
          metadata.push(currentMeta);
        } else if (currentMeta) currentMeta.value = `${currentMeta.value} ${line}`.trim();
      });
    }

    const sections = [];
    let activeSection = null;
    lines.slice(firstSectionIndex < 0 ? lines.length : firstSectionIndex).forEach(line => {
      if (STATBLOCK_SECTION_HEADINGS.includes(line)) {
        activeSection = { title: line, lines: [] };
        sections.push(activeSection);
      } else if (activeSection) activeSection.lines.push(line);
    });

    return { abilities, metadata, sections: sections.map(section => ({ title: section.title, entries: splitStatblockEntries(section.lines.join(" ")) })) };
  }

  function statblockAbilityMarkup(abilities) {
    if (!abilities.length) return "";
    return `<div class="inline-statblock-abilities">${abilities.map(ability => `<div class="inline-statblock-ability"><div class="inline-statblock-ability-heading"><strong>${escapeHtml(ability.name)}</strong><span>${escapeHtml(ability.score)}</span></div><div class="inline-statblock-ability-values"><small><b>Mod</b><span>${escapeHtml(ability.modifier)}</span></small><em><b>Save</b><span>${escapeHtml(ability.save)}</span></em></div></div>`).join("")}</div>`;
  }

  function statblockMetadataMarkup(metadata) {
    if (!metadata.length) return "";
    return `<dl class="inline-statblock-metadata">${metadata.map(item => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value || "—")}</dd></div>`).join("")}</dl>`;
  }

  function statblockSectionsMarkup(sections) {
    if (!sections.length) return "";
    return `<div class="inline-statblock-sections">${sections.map(section => `<section class="inline-statblock-section"><h4>${escapeHtml(section.title)}</h4>${section.entries.map(entry => `<article class="inline-statblock-entry">${entry.title ? `<h5>${escapeHtml(entry.title)}</h5>` : ""}<p>${escapeHtml(entry.text)}</p></article>`).join("")}</section>`).join("")}</div>`;
  }

  function expandedStatblockMarkup(combatant) {
    if (!combatant.statblockId || !expandedStatblocks.has(combatant.id)) return "";
    const statblock = getStatblockById(combatant.statblockId);
    if (!statblock) return "";
    const structured = parseStructuredStatblock(statblock);
    return `<section class="inline-statblock" aria-label="${escapeHtml(statblock.name)} statblock">
      <header class="inline-statblock-header"><div><div class="dm-section-label">SRD Statblock</div><h3>${escapeHtml(statblock.name)}</h3><p>${escapeHtml(statblock.size)} ${escapeHtml(statblock.type)}, ${escapeHtml(statblock.alignment)}</p></div><button type="button" class="inline-statblock-close" data-action="toggle-statblock" aria-label="Close ${escapeHtml(statblock.name)} statblock">×</button></header>
      <div class="inline-statblock-vitals"><div><span>Armor Class</span><strong>${escapeHtml(statblock.armorClass)}</strong></div><div><span>Hit Points</span><strong>${escapeHtml(statblock.hp)}</strong><small>${statblock.hpFormula ? `(${escapeHtml(statblock.hpFormula)})` : ""}</small></div><div><span>Initiative</span><strong>${escapeHtml(statblock.initiative || "—")}</strong></div><div><span>Speed</span><strong>${escapeHtml(statblock.speed || "—")}</strong></div><div><span>Challenge</span><strong>CR ${escapeHtml(statblock.challengeRating)}</strong></div></div>
      ${statblockAbilityMarkup(structured.abilities)}
      ${statblockMetadataMarkup(structured.metadata)}
      ${statblockSectionsMarkup(structured.sections)}
    </section>`;
  }

  function renderCombatantRow(combatant, displayIndex) {
    const isNpc = combatant.type === "npc";
    const statblock = getStatblockById(combatant.statblockId);
    const activeClass = `${combatant.id === state.activeId ? " active-turn" : ""}${statblock ? " has-statblock" : ""}`;
    const encodedName = escapeHtml(combatant.name);
    const hasInitiative = numericInitiative(combatant.initiative) !== Number.NEGATIVE_INFINITY;

    return `<article class="combatant-row${activeClass}" data-id="${escapeHtml(combatant.id)}" data-type="${combatant.type}">
      <div class="combatant-order-medallion" aria-hidden="true">${hasInitiative ? displayIndex + 1 : "·"}</div>
      <div class="combatant-name-wrap">
        ${isNpc ? rowInput({ className: "combatant-name-input", field: "name", value: combatant.name, label: "NPC name" }) : `<span class="combatant-name">${encodedName}</span>`}
        <span class="combatant-type">${isNpc ? (statblock ? `${escapeHtml(statblock.section)} · SRD statblock` : "Custom NPC") : "Player character · live sync"}</span>
        ${statblock ? `<button type="button" class="statblock-toggle" data-action="toggle-statblock">${expandedStatblocks.has(combatant.id) ? "Hide" : "View"} statblock</button>` : ""}
      </div>
      <div class="combatant-initiative">${rowInput({ className: "initiative-input", field: "initiative", value: combatant.initiative, label: `Initiative for ${combatant.name}`, type: "number", inputmode: "numeric" })}</div>
      <div class="combatant-hp">${hpBarMarkup(combatant)}<div class="combatant-hp-fields">${rowInput({ className: "hp-current-input", field: "hpCurrent", value: combatant.hpCurrent, label: `Current HP for ${combatant.name}`, type: "number", inputmode: "numeric" })}<span class="hp-divider">/</span>${rowInput({ className: "hp-max-input", field: "hpMax", value: combatant.hpMax, label: `Maximum HP for ${combatant.name}`, type: "number", inputmode: "numeric" })}</div></div>
      <div class="combatant-ac">${rowInput({ className: "ac-input", field: "armorClass", value: combatant.armorClass, label: `Armor Class for ${combatant.name}`, type: "number", inputmode: "numeric" })}</div>
      <div class="combatant-conditions">${conditionEditorMarkup(combatant)}</div>
      <label class="combatant-concentration concentration-toggle" title="Concentrating"><input data-field="concentrating" type="checkbox" ${combatant.concentrating ? "checked" : ""} aria-label="${encodedName} is concentrating"><span class="concentration-rune" aria-hidden="true">✦</span></label>
      ${isNpc ? `<button class="combatant-remove" type="button" data-action="remove-npc" title="Remove ${encodedName}" aria-label="Remove ${encodedName}">×</button>` : `<span class="player-lock-icon" title="Character live sync" aria-label="Character live sync">◆</span>`}
      ${expandedStatblockMarkup(combatant)}
    </article>`;
  }

  function renderTracker() {
    const combatants = getCombatants();
    const list = document.getElementById("initiativeList");
    const empty = document.getElementById("initiativeEmptyState");
    const round = document.getElementById("roundNumber");
    const activeText = document.getElementById("activeTurnText");
    if (!list || !empty || !round || !activeText) return;
    list.innerHTML = combatants.map(renderCombatantRow).join("");
    empty.hidden = combatants.length > 0;
    round.textContent = String(state.round);
    const active = combatants.find(combatant => combatant.id === state.activeId);
    activeText.textContent = active ? `Current turn · ${active.name}` : "Add initiative values to begin.";
  }

  function publishLiveUpdate(update) {
    const payload = { type: "live-summary-updated", ...update, nonce: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` };
    try { syncChannel?.postMessage(payload); } catch {}
    try { localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(payload)); } catch {}
  }

  function updatePlayerSummaryLocally(id, patch) {
    const character = playerCharacters.find(item => item.id === id);
    if (character) Object.assign(character, patch);
  }

  function schedulePlayerStatusSave(id) {
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(async () => {
      saveTimers.delete(id);
      const character = playerCharacters.find(item => item.id === id);
      if (!character) return;
      const payload = { id, hpCurrent: character.hpCurrent ?? "", hpMax: character.hpMax ?? "", tempHp: character.tempHp ?? "", armorClass: character.armorClass ?? "", currentConditions: character.currentConditions ?? "" };
      try {
        const result = await characterStorage.saveCharacterStatus(payload);
        publishLiveUpdate({ ...payload, updatedAt: result?.updatedAt || new Date().toISOString() });
      } catch (error) { console.warn("Could not save DM-screen player status:", error.message); }
    }, SAVE_DELAY));
  }

  function updateNpc(id, field, value) {
    const npc = state.npcs.find(item => item.id === id);
    if (!npc) return;
    npc[field] = value;
    persistTrackerState();
  }

  function updateCombatantConditions(id, type, conditions) {
    const currentConditions = serializeConditionNames(conditions);
    if (type === "npc") updateNpc(id, "currentConditions", currentConditions);
    else { updatePlayerSummaryLocally(id, { currentConditions }); schedulePlayerStatusSave(id); }
  }

  function refreshHpBar(row) {
    const current = numericHp(row.querySelector('[data-field="hpCurrent"]')?.value);
    const max = numericHp(row.querySelector('[data-field="hpMax"]')?.value);
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
    const bar = row.querySelector(".combatant-hp-bar");
    if (!bar) return;
    bar.style.width = `${pct}%`;
    bar.classList.toggle("danger", pct > 0 && pct <= 50);
  }

  function restoreFocus(id, field, selectionStart) {
    const restored = document.querySelector(`.combatant-row[data-id="${CSS.escape(id)}"] [data-field="${CSS.escape(field)}"]`);
    restored?.focus();
    if (restored && typeof selectionStart === "number" && typeof restored.setSelectionRange === "function") restored.setSelectionRange(selectionStart, selectionStart);
  }

  function handleTrackerInput(event) {
    const input = event.target.closest("[data-field]");
    const row = input?.closest(".combatant-row");
    if (!input || !row) return;
    const { id, type } = row.dataset;
    const field = input.dataset.field;
    const value = input.type === "checkbox" ? input.checked : input.value;
    if (type === "npc") updateNpc(id, field, value);
    else if (field === "initiative") { state.playerInitiatives[id] = String(value); persistTrackerState(); }
    else if (field === "concentrating") { state.playerConcentration[id] = Boolean(value); persistTrackerState(); }
    else { updatePlayerSummaryLocally(id, { [field]: String(value) }); schedulePlayerStatusSave(id); }
    if (field === "hpCurrent" || field === "hpMax") refreshHpBar(row);
  }

  function commitTrackerField(event) {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    if (input.dataset.field === "initiative" || input.dataset.field === "name") renderTracker();
  }

  function addCondition(row, rawCondition) {
    if (!row || !rawCondition) return;
    const { id, type } = row.dataset;
    let condition = rawCondition;
    if (rawCondition === CUSTOM_CONDITION_VALUE) condition = prompt("Enter a custom condition:", "")?.trim() || "";
    if (!condition) return;
    const combatant = getCombatants().find(item => item.id === id);
    if (!combatant) return;
    const conditions = normalizeConditionNames(combatant.currentConditions);
    if (!conditions.some(item => item.toLowerCase() === condition.toLowerCase())) { conditions.push(condition); updateCombatantConditions(id, type, conditions); }
    focusedConditions.set(id, normalizeConditionNames(condition)[0] || condition);
    renderTracker();
  }

  function removeCondition(row, condition) {
    if (!row || !condition) return;
    const { id, type } = row.dataset;
    const combatant = getCombatants().find(item => item.id === id);
    if (!combatant) return;
    updateCombatantConditions(id, type, normalizeConditionNames(combatant.currentConditions).filter(item => item.toLowerCase() !== condition.toLowerCase()));
    if (focusedConditions.get(id)?.toLowerCase() === condition.toLowerCase()) focusedConditions.delete(id);
    renderTracker();
  }

  function showCondition(row, condition) {
    if (!row || !condition) return;
    const id = row.dataset.id;
    if (focusedConditions.get(id) === condition) focusedConditions.delete(id); else focusedConditions.set(id, condition);
    renderTracker();
  }

  function addCustomNpc() {
    state.npcs.push(normalizeNpc({ id: createId(), name: "New NPC" }));
    persistTrackerState();
    closeNpcPicker();
    renderTracker();
  }

  function addStatblockNpc(statblockId) {
    const statblock = getStatblockById(statblockId);
    if (!statblock) return;
    const npc = normalizeNpc({ id: createId(), name: statblock.name, hpCurrent: statblock.hp, hpMax: statblock.hp, armorClass: statblock.armorClass, statblockId: statblock.id, source: "SRD 5.2.1" });
    state.npcs.push(npc);
    expandedStatblocks.add(npc.id);
    persistTrackerState();
    closeNpcPicker();
    renderTracker();
  }

  function removeNpc(id) {
    state.npcs = state.npcs.filter(npc => npc.id !== id);
    focusedConditions.delete(id);
    expandedStatblocks.delete(id);
    if (state.activeId === id) state.activeId = "";
    persistTrackerState();
    renderTracker();
  }

  function getInitiativeCombatants() { return getCombatants().filter(combatant => numericInitiative(combatant.initiative) !== Number.NEGATIVE_INFINITY); }

  function advanceTurn() {
    const combatants = getInitiativeCombatants();
    if (!combatants.length) { state.activeId = ""; persistTrackerState(); renderTracker(); return; }
    const currentIndex = combatants.findIndex(combatant => combatant.id === state.activeId);
    if (currentIndex < 0) state.activeId = combatants[0].id;
    else if (currentIndex === combatants.length - 1) { state.activeId = combatants[0].id; state.round += 1; }
    else state.activeId = combatants[currentIndex + 1].id;
    persistTrackerState(); renderTracker();
  }

  function resetCombat() {
    if (!confirm("Reset initiative values, NPCs, concentration markers, active turn, and round number?")) return;
    state = { round: 1, activeId: "", playerInitiatives: {}, playerConcentration: {}, npcs: [] };
    focusedConditions.clear(); expandedStatblocks.clear(); persistTrackerState(); renderTracker();
  }

  function receiveLiveUpdate(payload) {
    if (!payload || payload.type !== "live-summary-updated" || !payload.id) return;
    updatePlayerSummaryLocally(payload.id, { hpCurrent: payload.hpCurrent ?? "", hpMax: payload.hpMax ?? "", tempHp: payload.tempHp ?? "", armorClass: payload.armorClass ?? "", currentConditions: payload.currentConditions ?? "" });
    if (!saveTimers.has(payload.id)) renderTracker();
  }

  async function refreshPlayers() {
    try { playerCharacters = await characterStorage.listCharacterData(); renderTracker(); }
    catch (error) { console.warn("Could not refresh DM-screen characters:", error.message); }
  }

  function startPolling() { clearInterval(pollTimer); pollTimer = setInterval(refreshPlayers, POLL_DELAY); }

  function uniqueSorted(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })); }
  function fillFilter(selectId, values) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const first = select.options[0]?.outerHTML || "";
    select.innerHTML = first + uniqueSorted(values).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  }

  async function loadStatblockLibrary() {
    try {
      const response = await fetch(`${STATBLOCK_LIBRARY_URL}?cacheBust=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load SRD statblocks.");
      statblockLibrary = await response.json();
      fillFilter("statblockSectionFilter", statblockLibrary.map(item => item.section));
      fillFilter("statblockTypeFilter", statblockLibrary.map(item => item.type));
      fillFilter("statblockSizeFilter", statblockLibrary.map(item => item.size));
      fillFilter("statblockCrFilter", statblockLibrary.map(item => item.challengeRating));
      renderStatblockResults();
    } catch (error) {
      console.warn(error.message);
      const results = document.getElementById("statblockResults");
      if (results) results.innerHTML = `<p class="initiative-empty-state">Could not load the SRD statblock library.</p>`;
    }
  }

  function statblockMatchesFilters(statblock) {
    const query = String(document.getElementById("statblockSearchInput")?.value || "").trim().toLowerCase();
    const section = document.getElementById("statblockSectionFilter")?.value || "";
    const type = document.getElementById("statblockTypeFilter")?.value || "";
    const size = document.getElementById("statblockSizeFilter")?.value || "";
    const cr = document.getElementById("statblockCrFilter")?.value || "";
    const haystack = `${statblock.name} ${statblock.type} ${statblock.alignment} ${statblock.text}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!section || statblock.section === section) && (!type || statblock.type === type) && (!size || statblock.size === size) && (!cr || statblock.challengeRating === cr);
  }

  function renderStatblockResult(statblock) {
    return `<article class="statblock-result-card"><div><h3>${escapeHtml(statblock.name)}</h3><p>${escapeHtml(statblock.size)} ${escapeHtml(statblock.type)}, ${escapeHtml(statblock.alignment)}</p>${statblockSummaryMarkup(statblock)}<small>${escapeHtml(statblock.section)} · Speed ${escapeHtml(statblock.speed || "—")}</small></div><button type="button" class="dm-primary-button" data-action="add-statblock-npc" data-statblock-id="${escapeHtml(statblock.id)}">Add</button></article>`;
  }

  function renderStatblockResults() {
    const results = document.getElementById("statblockResults");
    const count = document.getElementById("statblockResultCount");
    if (!results || !count) return;
    const matching = statblockLibrary.filter(statblockMatchesFilters);
    count.textContent = `${matching.length} statblock${matching.length === 1 ? "" : "s"}`;
    results.innerHTML = matching.length ? matching.map(renderStatblockResult).join("") : `<p class="initiative-empty-state">No statblocks match these filters.</p>`;
  }

  function openNpcPicker() {
    const backdrop = document.getElementById("npcPickerBackdrop");
    if (!backdrop) return;
    backdrop.classList.remove("is-hidden");
    backdrop.setAttribute("aria-hidden", "false");
    renderStatblockResults();
  }

  function closeNpcPicker() {
    const backdrop = document.getElementById("npcPickerBackdrop");
    if (!backdrop) return;
    backdrop.classList.add("is-hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }

  function clearStatblockFilters() {
    ["statblockSearchInput", "statblockSectionFilter", "statblockTypeFilter", "statblockSizeFilter", "statblockCrFilter"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    renderStatblockResults();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    state.npcs = state.npcs.map(normalizeNpc);
    persistTrackerState();

    const list = document.getElementById("initiativeList");
    list?.addEventListener("input", handleTrackerInput);
    list?.addEventListener("change", event => {
      const picker = event.target.closest('[data-action="add-condition"]');
      if (picker) { addCondition(picker.closest(".combatant-row"), picker.value); return; }
      handleTrackerInput(event);
      commitTrackerField(event);
    });
    list?.addEventListener("click", event => {
      const row = event.target.closest(".combatant-row");
      const actionElement = event.target.closest("[data-action]");
      const action = actionElement?.dataset.action;
      if (!row) return;
      if (!action && row.classList.contains("has-statblock") && !event.target.closest("input, select, button, label, .inline-statblock")) {
        const id = row.dataset.id || "";
        if (expandedStatblocks.has(id)) expandedStatblocks.delete(id); else expandedStatblocks.add(id);
        renderTracker();
        return;
      }
      if (!action) return;
      if (action === "remove-npc") removeNpc(row.dataset.id || "");
      if (action === "show-condition") showCondition(row, actionElement.dataset.condition || "");
      if (action === "remove-condition") removeCondition(row, actionElement.dataset.condition || "");
      if (action === "close-condition-info") { focusedConditions.delete(row.dataset.id || ""); renderTracker(); }
      if (action === "toggle-statblock") { const id = row.dataset.id || ""; if (expandedStatblocks.has(id)) expandedStatblocks.delete(id); else expandedStatblocks.add(id); renderTracker(); }
    });

    document.getElementById("addNpcBtn")?.addEventListener("click", openNpcPicker);
    document.getElementById("addCustomNpcBtn")?.addEventListener("click", addCustomNpc);
    document.getElementById("closeNpcPickerBtn")?.addEventListener("click", closeNpcPicker);
    document.getElementById("npcPickerBackdrop")?.addEventListener("click", event => { if (event.target.id === "npcPickerBackdrop") closeNpcPicker(); });
    document.getElementById("statblockResults")?.addEventListener("click", event => { const button = event.target.closest('[data-action="add-statblock-npc"]'); if (button) addStatblockNpc(button.dataset.statblockId || ""); });
    ["statblockSearchInput", "statblockSectionFilter", "statblockTypeFilter", "statblockSizeFilter", "statblockCrFilter"].forEach(id => document.getElementById(id)?.addEventListener(id === "statblockSearchInput" ? "input" : "change", renderStatblockResults));
    document.getElementById("clearStatblockFiltersBtn")?.addEventListener("click", clearStatblockFilters);
    document.getElementById("nextTurnBtn")?.addEventListener("click", advanceTurn);
    document.getElementById("resetCombatBtn")?.addEventListener("click", resetCombat);
    window.addEventListener("keydown", event => { if (event.key === "Escape") closeNpcPicker(); });

    syncChannel?.addEventListener("message", event => receiveLiveUpdate(event.data));
    window.addEventListener("storage", event => { if (event.key !== SYNC_STORAGE_KEY || !event.newValue) return; try { receiveLiveUpdate(JSON.parse(event.newValue)); } catch {} });

    try { await Promise.all([characterStorage.init(), loadStatblockLibrary()]); await refreshPlayers(); startPolling(); }
    catch (error) { console.error(error); alert(error.message || "Could not initialize the DM screen."); }
  });
})();
