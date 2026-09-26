// Mythical Blue · DM screen initiative tracker
// Player rows stay connected to live character summaries. SRD and custom NPCs can show inline statblocks.

(() => {
  const DM_STATE_KEY = "mythicalBlueDMTrackerV1";
  const SYNC_CHANNEL_NAME = "mythical-blue-hp-sync-v1";
  const SYNC_STORAGE_KEY = "mythicalBlueHPBroadcastV1";
  const STATBLOCK_LIBRARY_URL = "data/srd-statblocks.json";
  const CUSTOM_STATBLOCK_SEED_URL = "data/custom-statblocks.json";
  const CUSTOM_MONSTER_SECTION = "Custom Monsters";
  const SAVE_DELAY = 550;
  const POLL_DELAY = 5000;
  const CUSTOM_CONDITION_VALUE = "__custom__";
  const ABILITY_LABELS = ["Str", "Dex", "Con", "Int", "Wis", "Cha"];
  const SKILL_ABILITIES = {
    acrobatics: "Dex",
    "animal handling": "Wis",
    arcana: "Int",
    athletics: "Str",
    deception: "Cha",
    history: "Int",
    insight: "Wis",
    intimidation: "Cha",
    investigation: "Int",
    medicine: "Wis",
    nature: "Int",
    perception: "Wis",
    performance: "Cha",
    persuasion: "Cha",
    religion: "Int",
    "sleight of hand": "Dex",
    stealth: "Dex",
    survival: "Wis"
  };

  let playerCharacters = [];
  let statblockLibrary = [];
  let customStatblockLibrary = [];
  let campaignCustomStatblockLibrary = [];
  let state = loadTrackerState();
  let saveTimers = new Map();
  const pendingPlayerLivePatches = new Map();
  const inFlightPlayerLivePatches = new Map();
  let playersRefreshInFlight = false;
  let trackerReorderPending = false;
  let trackerReorderFrame = null;
  let pollTimer = null;
  let selectedStatblockId = "";
  let editingStatblockId = "";
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
    const fallback = { round: 1, activeId: "", playerInitiatives: {}, playerConcentration: {}, absentPlayers: {}, autoRollNpcInitiative: false, npcs: [], customStatblocks: [] };
    try {
      const parsed = JSON.parse(localStorage.getItem(DM_STATE_KEY) || "{}");
      return {
        round: Math.max(1, Number(parsed.round) || 1),
        activeId: String(parsed.activeId || ""),
        playerInitiatives: parsed.playerInitiatives && typeof parsed.playerInitiatives === "object" ? parsed.playerInitiatives : {},
        playerConcentration: parsed.playerConcentration && typeof parsed.playerConcentration === "object" ? parsed.playerConcentration : {},
        absentPlayers: parsed.absentPlayers && typeof parsed.absentPlayers === "object" ? parsed.absentPlayers : {},
        autoRollNpcInitiative: parsed.autoRollNpcInitiative === true,
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs : [],
        customStatblocks: Array.isArray(parsed.customStatblocks) ? parsed.customStatblocks : []
      };
    } catch {
      return fallback;
    }
  }

  function persistTrackerState() {
    localStorage.setItem(DM_STATE_KEY, JSON.stringify(state));
  }

  function numericInitiative(value) {
    const parsed = Number.parseFloat(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  }

  function numericHp(value) {
    const parsed = Number.parseFloat(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
  }

  function abilityModifierNumber(score) {
    const value = Number.parseInt(String(score || "10"), 10);
    return Math.floor(((Number.isFinite(value) ? value : 10) - 10) / 2);
  }

  function formatBonus(value) {
    const numeric = Number.parseInt(String(value ?? "0"), 10);
    const safe = Number.isFinite(numeric) ? numeric : 0;
    return `${safe >= 0 ? "+" : ""}${safe}`;
  }

  function abilityModifier(score) {
    return formatBonus(abilityModifierNumber(score));
  }

  function bonusToNumber(value) {
    const parsed = Number.parseInt(String(value ?? "").replace(/−/g, "-").replace(/\s+/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function challengeToProficiencyBonus(cr) {
    const raw = String(cr || "0").trim().toLowerCase();
    const numeric = raw.includes("/")
      ? raw.split("/").reduce((acc, part, index) => index === 0 ? Number(part) : acc / Number(part), 0)
      : Number.parseFloat(raw);
    const value = Number.isFinite(numeric) ? numeric : 0;
    if (value >= 29) return 9;
    if (value >= 25) return 8;
    if (value >= 21) return 7;
    if (value >= 17) return 6;
    if (value >= 13) return 5;
    if (value >= 9) return 4;
    if (value >= 5) return 3;
    return 2;
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

  function normalizeStatblock(statblock) {
    const rawSection = String(statblock.section || CUSTOM_MONSTER_SECTION);
    const section = rawSection.toLowerCase() === "custom" ? CUSTOM_MONSTER_SECTION : rawSection;
    const normalized = {
      id: String(statblock.id || createId("custom-statblock")),
      name: String(statblock.name || "Unnamed Statblock"),
      section,
      size: String(statblock.size || "Medium"),
      type: String(statblock.type || "Creature"),
      alignment: String(statblock.alignment || "Unaligned"),
      armorClass: String(statblock.armorClass ?? ""),
      initiative: String(statblock.initiative ?? ""),
      hp: String(statblock.hp ?? ""),
      hpFormula: String(statblock.hpFormula || ""),
      speed: String(statblock.speed || ""),
      challengeRating: String(statblock.challengeRating || ""),
      proficiencyBonus: String(statblock.proficiencyBonus || ""),
      description: String(statblock.description || ""),
      text: String(statblock.text || ""),
      source: String(statblock.source || (section === CUSTOM_MONSTER_SECTION ? "Custom Monster" : "SRD 5.2.1")),
      saveProficiencies: Array.isArray(statblock.saveProficiencies) ? statblock.saveProficiencies : [],
      skillProficiencies: Array.isArray(statblock.skillProficiencies) ? statblock.skillProficiencies : [],
      skillExpertise: Array.isArray(statblock.skillExpertise) ? statblock.skillExpertise : []
    };
    normalized.proficiencyBonus = String(getProficiencyBonus(normalized) || "");
    normalized.legendaryResistanceMax = getLegendaryResistanceMax(normalized);
    normalized.legendaryActionMax = getLegendaryActionMax(normalized);
    return normalized;
  }

  function combineStatblockLists(...lists) {
    const combined = new Map();
    lists.flat().filter(Boolean).forEach(item => {
      const normalized = normalizeStatblock(item);
      combined.set(normalized.id, normalized);
    });
    return [...combined.values()].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    );
  }

  function getCustomStatblocks() {
    return combineStatblockLists(state.customStatblocks || [], campaignCustomStatblockLibrary);
  }

  function getAllStatblocks() {
    const custom = getCustomStatblocks();
    const customIds = new Set(custom.map(item => item.id));
    const seededCustom = customStatblockLibrary.filter(item => !customIds.has(item.id)).map(normalizeStatblock);
    const libraryIds = new Set([...customIds, ...seededCustom.map(item => item.id)]);
    const srd = statblockLibrary.filter(item => !libraryIds.has(item.id)).map(normalizeStatblock);
    return [...custom, ...seededCustom, ...srd];
  }

  function isCustomStatblock(statblock) {
    const section = String(statblock?.section || "").toLowerCase();
    const source = String(statblock?.source || "").toLowerCase();
    const id = String(statblock?.id || "").toLowerCase();
    return section === "custom" || section === CUSTOM_MONSTER_SECTION.toLowerCase() || source.includes("custom") || id.startsWith("custom-");
  }

  function getStatblockById(id) {
    return getAllStatblocks().find(statblock => statblock.id === id) || null;
  }

  function explicitNonZeroNumber(value) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function cleanStatblockText(statblock) {
    return String(statblock?.text || "")
      .replace(/\u2212/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getLegendaryResistanceMax(statblock) {
    const explicit = explicitNonZeroNumber(statblock?.legendaryResistanceMax);
    if (explicit) return explicit;
    const text = cleanStatblockText(statblock);
    const patterns = [
      /Legendary Resistance\s*\(\s*(\d+)\s*\/\s*Day/i,
      /Legendary Resistances?\s*[:(]\s*(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return 0;
  }

  function getLegendaryActionMax(statblock) {
    const explicit = explicitNonZeroNumber(statblock?.legendaryActionMax);
    if (explicit) return explicit;
    const text = cleanStatblockText(statblock);
    const patterns = [
      /Legendary Action Uses\s*:\s*(\d+)/i,
      /can take\s+(\d+)\s+legendary actions?/i,
      /Legendary Actions?\s*\(\s*(\d+)\s*\/\s*Round/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return /Legendary Actions/i.test(text) ? 3 : 0;
  }

  function getProficiencyBonus(statblock) {
    const explicit = explicitNonZeroNumber(statblock?.proficiencyBonus);
    if (explicit) return explicit;
    const text = cleanStatblockText(statblock);
    const pbMatch = text.match(/\bPB\s*([+−-]?\s*\d+)/i);
    if (pbMatch) return Math.max(0, bonusToNumber(pbMatch[1]));
    const crMatch = text.match(/\bCR\s+([^\s(]+)/i);
    return challengeToProficiencyBonus(statblock?.challengeRating || crMatch?.[1] || 0);
  }

  function parseCommaList(value) {
    return String(value || "")
      .split(/[,;\n]/)
      .map(item => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex(other => other.toLowerCase() === item.toLowerCase()) === index);
  }

  function selectedCheckboxValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  }

  function setCheckedValues(name, values) {
    const selected = new Set((values || []).map(value => String(value).toLowerCase()));
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = selected.has(String(input.value).toLowerCase()); });
  }

  function abilityScoreMapFromPairs(abilities) {
    return new Map(abilities.map(([label, score]) => [label.toLowerCase(), score]));
  }

  function buildSkillsLine(skillProficiencies, skillExpertise, abilityScores, proficiencyBonus) {
    const expertiseSet = new Set(skillExpertise.map(item => item.toLowerCase()));
    const allSkills = [...skillProficiencies, ...skillExpertise]
      .filter((item, index, array) => array.findIndex(other => other.toLowerCase() === item.toLowerCase()) === index);
    const entries = allSkills.map(skill => {
      const ability = SKILL_ABILITIES[skill.toLowerCase()];
      if (!ability) return "";
      const mod = abilityModifierNumber(abilityScores.get(ability.toLowerCase()) || 10);
      const multiplier = expertiseSet.has(skill.toLowerCase()) ? 2 : 1;
      return `${skill} ${formatBonus(mod + proficiencyBonus * multiplier)}`;
    }).filter(Boolean);
    return entries.length ? `Skills ${entries.join(", ")}` : "";
  }

  function inferSaveProficiencies(abilities, proficiencyBonus) {
    return abilities
      .filter(ability => Math.abs(bonusToNumber(ability.save) - bonusToNumber(ability.modifier) - proficiencyBonus) <= 0)
      .map(ability => ability.name.charAt(0).toUpperCase() + ability.name.slice(1).toLowerCase());
  }

  function inferSkillsFromMetadata(metadata, abilities, proficiencyBonus) {
    const abilityScores = new Map((abilities || []).map(ability => [ability.name.toLowerCase(), ability.score]));
    const skillsLine = metadata.find(item => item.label === "Skills")?.value || "";
    const proficient = [];
    const expert = [];
    skillsLine.split(",").map(item => item.trim()).filter(Boolean).forEach(item => {
      const match = item.match(/^(.+?)\s+([+−-]\s*\d+)$/);
      if (!match) return;
      const skill = match[1].trim();
      const ability = SKILL_ABILITIES[skill.toLowerCase()];
      if (!ability) return;
      const mod = abilityModifierNumber(abilityScores.get(ability.toLowerCase()) || 10);
      const total = bonusToNumber(match[2]);
      if (total >= mod + proficiencyBonus * 2) expert.push(skill);
      else if (total >= mod + proficiencyBonus) proficient.push(skill);
    });
    return { proficient, expert };
  }

  function normalizeNpc(npc) {
    const statblock = npc.statblockId ? getStatblockById(npc.statblockId) : null;
    const statblockLrMax = statblock ? getLegendaryResistanceMax(statblock) : 0;
    const statblockLaMax = statblock ? getLegendaryActionMax(statblock) : 0;
    const savedLrMax = explicitNonZeroNumber(npc.legendaryResistanceMax);
    const savedLaMax = explicitNonZeroNumber(npc.legendaryActionMax);
    const lrMax = Math.max(savedLrMax, statblockLrMax);
    const laMax = Math.max(savedLaMax, statblockLaMax);
    const savedLrCurrent = Number.parseInt(String(npc.legendaryResistanceCurrent ?? "").trim(), 10);
    const savedLaCurrent = Number.parseInt(String(npc.legendaryActionCurrent ?? "").trim(), 10);
    const lrCurrent = Number.isFinite(savedLrCurrent) && (savedLrMax || !statblockLrMax) ? savedLrCurrent : lrMax;
    const laCurrent = Number.isFinite(savedLaCurrent) && (savedLaMax || !statblockLaMax) ? savedLaCurrent : laMax;
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
      source: String(npc.source || ""),
      legendaryResistanceMax: lrMax,
      legendaryResistanceCurrent: Math.max(0, Math.min(lrMax, lrCurrent)),
      legendaryActionMax: laMax,
      legendaryActionCurrent: Math.max(0, Math.min(laMax, laCurrent))
    };
  }

  function getCombatants() {
    const players = playerCharacters.filter(character => !state.absentPlayers[character.id]).map(character => ({
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
      source: "",
      legendaryResistanceMax: 0,
      legendaryResistanceCurrent: 0,
      legendaryActionMax: 0,
      legendaryActionCurrent: 0
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
    const input = document.createElement("input");
    input.className = className;
    input.dataset.field = field;
    input.type = type;
    input.inputMode = inputmode;
    input.value = String(value ?? "");
    input.setAttribute("aria-label", label);
    return input;
  }

  function hpBarElement(combatant) {
    const hpCurrent = numericHp(combatant.hpCurrent);
    const hpMax = numericHp(combatant.hpMax);
    const pct = hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpCurrent / hpMax) * 100))) : 0;
    const wrap = document.createElement("div");
    wrap.className = "combatant-hp-bwrap";
    wrap.setAttribute("aria-hidden", "true");
    const bar = document.createElement("div");
    bar.className = "combatant-hp-bar";
    bar.style.width = `${pct}%`;
    bar.classList.toggle("danger", pct > 0 && pct <= 50);
    wrap.append(bar);
    return wrap;
  }

  function statblockSummaryElement(statblock) {
    if (!statblock) return "";
    const lr = getLegendaryResistanceMax(statblock);
    const la = getLegendaryActionMax(statblock);
    const pb = getProficiencyBonus(statblock);
    const summary = document.createElement("div");
    summary.className = "statblock-summary-chips";
    const chips = [
      `AC ${statblock.armorClass}`,
      `HP ${statblock.hp}${statblock.hpFormula ? ` (${statblock.hpFormula})` : ""}`,
      `CR ${statblock.challengeRating || "—"}`,
      `${statblock.size} ${statblock.type}`
    ];
    if (pb) chips.push(`PB +${pb}`);
    if (lr) chips.push(`LR ${lr}`);
    if (la) chips.push(`LA ${la}`);
    chips.forEach(text => {
      const chip = document.createElement("span");
      chip.textContent = text;
      summary.append(chip);
    });
    return summary;
  }

  const STATBLOCK_SECTION_HEADINGS = ["Traits", "Actions", "Bonus Actions", "Reactions", "Legendary Actions", "Lair Actions"];
  const STATBLOCK_META_PREFIXES = ["Saving Throws", "Skills", "Gear", "Damage Vulnerabilities", "Damage Resistances", "Damage Immunities", "Condition Immunities", "Senses", "Languages", "CR", "Resistances", "Immunities", "Vulnerabilities"];
  // Colon-labelled lines inside an entry (spell lists, attack results) that must not start a new entry.
  const STATBLOCK_CONTINUATION_LABEL = /^(?:\d|legendary action uses\b|hit\b|miss\b|failure\b|success\b|first\b|second\b|trigger\b|response\b|at will\b|cantrips?\b)|(?:saving throw|attack roll|slots?\)?|each)$/i;

  function normalizeStatblockLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeEscapedLineBreaks(value) {
    return String(value || "")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n");
  }

  function normalizeStatblockTextareaValue(value) {
    return normalizeEscapedLineBreaks(value)
      .split(/\r?\n/)
      .map(line => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function expandInlineStatblockEntryBreaks(value) {
    return normalizeEscapedLineBreaks(value).replace(
      /([.!?])\s+([A-Z][A-Za-z0-9’'()/-]*(?:\s+[A-Za-z0-9’'()/-]+){0,5})\.\s+(?=(?:Melee|Ranged|Weapon|Spell|Attack|The monster|The target|If|One|Each|DC|Dexterity|Strength|Constitution|Wisdom|Intelligence|Charisma|Hit|Saving)\b)/g,
      (_match, punctuation, title) => `${punctuation}\n${title}. `
    );
  }

  function looksLikeStatblockEntryTitle(value) {
    const title = normalizeStatblockLine(value);
    if (!title || title.length > 92 || /[:;!?]/.test(title)) return false;

    // Action names can contain lowercase parenthetical descriptors, such as
    // "Crossbow (light)." or "Net (thrown).". Those descriptors should not
    // prevent the line from being treated as a separate statblock entry.
    const titleWithoutParentheticals = title.replace(/\([^)]*\)/g, " ");
    const words = titleWithoutParentheticals
      .split(/\s+/)
      .map(word => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9’'-]+$/g, ""))
      .filter(Boolean);

    if (!words.length || words.length > 10) return false;

    const connectors = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "if", "in", "into", "of", "on", "only", "or", "over", "per", "the", "to", "under", "with", "while"]);
    return words.every((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && connectors.has(lower)) return true;
      return /^[A-Z0-9]/.test(word);
    });
  }

  function splitStatblockEntries(lines, { linePerEntry = false } = {}) {
    const rawText = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
    const sourceLines = linePerEntry ? normalizeEscapedLineBreaks(rawText).split(/\r?\n/) : expandInlineStatblockEntryBreaks(rawText).split(/\r?\n/);
    const entries = [];
    let current = null;

    sourceLines.map(normalizeStatblockLine).filter(Boolean).forEach(line => {
      // Custom statblocks keep one entry per line, and their entry names may end in "." or ":".
      const titleMatch = linePerEntry ? line.match(/^([^.!?:]{1,92})([.:])\s*(.*)$/) : line.match(/^([^.!?]{1,92})(\.)\s*(.*)$/);
      const isContinuationLabel = titleMatch?.[2] === ":" && STATBLOCK_CONTINUATION_LABEL.test(titleMatch[1].trim());
      // A wrapped SRD line such as "Scorching Ray." finishes the previous sentence rather than starting an entry.
      const finishesSentence = !linePerEntry && current && !titleMatch?.[3] && !/[.!?:)]$/.test(current.text);
      if (titleMatch && !isContinuationLabel && !finishesSentence && looksLikeStatblockEntryTitle(titleMatch[1])) {
        current = { title: titleMatch[1].trim(), text: titleMatch[3].trim(), more: [] };
        entries.push(current);
        return;
      }

      if (!current) {
        current = { title: "", text: line, more: [] };
        entries.push(current);
        return;
      }

      // Spell lists ("At Will: …", "1/Day: …") start their own paragraph; other wrapped lines join the last one.
      if (linePerEntry || /^(?:at will|cantrips|\d+\/day(?: each)?|\d+(?:st|nd|rd|th) level)\b[^:]{0,30}:/i.test(line)) current.more.push(line);
      else if (current.more.length) current.more[current.more.length - 1] = `${current.more[current.more.length - 1]} ${line}`;
      else current.text = `${current.text} ${line}`.trim();
    });

    return entries.filter(entry => entry.title || entry.text || entry.more.length);
  }

  function parseStructuredStatblock(statblock) {
    const lines = normalizeEscapedLineBreaks(statblock.text || "").split(/\r?\n/).map(normalizeStatblockLine).filter(Boolean);
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

    const armorNote = preamble.find(line => /^AC\s+\d+/.test(line))?.match(/\((.+)\)/)?.[1] || "";
    const linePerEntry = isCustomStatblock(statblock);
    return { abilities, metadata, armorNote, sections: sections.map(section => ({ title: section.title, entries: splitStatblockEntries(section.lines, { linePerEntry }) })) };
  }

  const STATBLOCK_META_LABELS = { Resistances: "Damage Resistances", Vulnerabilities: "Damage Vulnerabilities", CR: "Challenge" };

  function displaySigned(value) {
    return String(value || "").replace(/-/g, "−");
  }

  function statblockProperty(label, value) {
    const line = document.createElement("p");
    line.className = "statblock-property";
    const name = document.createElement("b");
    name.textContent = label;
    line.append(name, ` ${value}`);
    return line;
  }

  function statblockRule() {
    const rule = document.createElement("div");
    rule.className = "statblock-rule";
    rule.setAttribute("aria-hidden", "true");
    return rule;
  }

  function createStatblockPanel(statblock, { closeButton = false, addButton = false, editButton = false } = {}) {
    if (!statblock) return null;
    const structured = parseStructuredStatblock(statblock);
    const proficiencyBonus = getProficiencyBonus(statblock);
    const panel = document.createElement("section");
    panel.className = "inline-statblock";
    panel.setAttribute("aria-label", `${statblock.name} statblock`);
    const header = document.createElement("header");
    header.className = "inline-statblock-header";
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = statblock.name;
    const subtitle = document.createElement("p");
    subtitle.className = "statblock-subtitle";
    subtitle.textContent = `${statblock.size} ${statblock.type}, ${statblock.alignment}`;
    heading.append(title, subtitle);
    header.append(heading);
    if (closeButton) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "inline-statblock-close";
      close.dataset.action = "toggle-statblock";
      close.setAttribute("aria-label", `Close ${statblock.name} statblock`);
      close.textContent = "×";
      header.append(close);
    }
    panel.append(header);
    if (statblock.description) {
      const description = document.createElement("p");
      description.className = "inline-statblock-description";
      description.textContent = statblock.description;
      panel.append(description);
    }

    const columns = document.createElement("div");
    columns.className = "statblock-columns";
    const main = document.createElement("div");
    main.className = "statblock-column";
    main.append(statblockRule());
    main.append(statblockProperty("Armor Class", `${statblock.armorClass || "—"}${structured.armorNote ? ` (${structured.armorNote})` : ""}`));
    main.append(statblockProperty("Hit Points", `${statblock.hp || "—"}${statblock.hpFormula ? ` (${statblock.hpFormula})` : ""}`));
    main.append(statblockProperty("Speed", statblock.speed || "—"));
    if (statblock.initiative) main.append(statblockProperty("Initiative", `${displaySigned(formatBonus(bonusToNumber(statblock.initiative)))} (${10 + bonusToNumber(statblock.initiative)})`));

    if (structured.abilities.length) {
      main.append(statblockRule());
      const table = document.createElement("table");
      table.className = "statblock-abilities";
      const head = document.createElement("tr");
      const values = document.createElement("tr");
      structured.abilities.forEach(ability => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = ability.name;
        const td = document.createElement("td");
        td.textContent = `${ability.score} (${displaySigned(ability.modifier)})`;
        head.append(th);
        values.append(td);
      });
      table.append(head, values);
      main.append(table);
    }

    main.append(statblockRule());
    const savingThrows = structured.abilities
      .filter(ability => bonusToNumber(ability.save) !== bonusToNumber(ability.modifier))
      .map(ability => `${ability.name.charAt(0)}${ability.name.slice(1).toLowerCase()} ${displaySigned(formatBonus(bonusToNumber(ability.save)))}`);
    if (savingThrows.length && !structured.metadata.some(item => item.label === "Saving Throws")) main.append(statblockProperty("Saving Throws", savingThrows.join(", ")));
    structured.metadata.forEach(item => main.append(statblockProperty(STATBLOCK_META_LABELS[item.label] || item.label, item.value || "—")));
    if (!structured.metadata.some(item => item.label === "CR") && statblock.challengeRating) main.append(statblockProperty("Challenge", `${statblock.challengeRating}${proficiencyBonus ? ` (PB +${proficiencyBonus})` : ""}`));
    columns.append(main);

    if (structured.sections.length) {
      const rules = document.createElement("div");
      rules.className = "statblock-column statblock-column-rules";
      structured.sections.forEach(section => {
        const sectionElement = document.createElement("section");
        sectionElement.className = "inline-statblock-section";
        if (section.title !== "Traits") {
          const sectionHeading = document.createElement("h4");
          sectionHeading.textContent = section.title;
          sectionElement.append(sectionHeading);
        }
        section.entries.forEach(entry => {
          const article = document.createElement("article");
          article.className = "inline-statblock-entry";
          const text = document.createElement("p");
          if (entry.title) {
            const entryTitle = document.createElement("strong");
            entryTitle.textContent = `${entry.title}.`;
            text.append(entryTitle, " ");
          }
          text.append(entry.text);
          article.append(text);
          (entry.more || []).forEach(paragraph => {
            const more = document.createElement("p");
            more.className = "statblock-entry-more";
            more.textContent = paragraph;
            article.append(more);
          });
          sectionElement.append(article);
        });
        rules.append(sectionElement);
      });
      columns.append(rules);
    }
    panel.append(columns);

    if (addButton || editButton) {
      const actions = document.createElement("div");
      actions.className = "statblock-preview-actions";
      if (editButton) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "dm-secondary-button";
        edit.dataset.action = "edit-statblock";
        edit.dataset.statblockId = statblock.id;
        edit.textContent = "Edit Statblock";
        actions.append(edit);
      }
      if (addButton) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "dm-primary-button";
        add.dataset.action = "add-previewed-statblock";
        add.dataset.statblockId = statblock.id;
        add.textContent = "+ Add to Tracker";
        actions.append(add);
      }
      panel.append(actions);
    }
    return panel;
  }

  function createExpandedStatblock(combatant) {
    if (!combatant.statblockId || !expandedStatblocks.has(combatant.id)) return "";
    const statblock = getStatblockById(combatant.statblockId);
    if (!statblock) return "";
    return createStatblockPanel(statblock, { closeButton: true });
  }

  function createLegendaryTracker(combatant) {
    if (combatant.type !== "npc") return null;
    const lrMax = toNumber(combatant.legendaryResistanceMax, 0);
    const laMax = toNumber(combatant.legendaryActionMax, 0);
    if (!lrMax && !laMax) return null;
    const tracker = document.createElement("div");
    tracker.className = "legendary-tracker";
    tracker.setAttribute("aria-label", "Legendary resources");
    [["resistance", "Legendary Resistances", combatant.legendaryResistanceCurrent, lrMax], ["action", "Legendary Actions", combatant.legendaryActionCurrent, laMax]].forEach(([kind, label, current, max]) => {
      if (!max) return;
      const counter = document.createElement("div");
      counter.className = `legendary-counter legendary-${kind}`;
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const decrement = document.createElement("button");
      decrement.type = "button";
      decrement.dataset.action = "adjust-legendary";
      decrement.dataset.kind = kind;
      decrement.dataset.delta = "-1";
      decrement.setAttribute("aria-label", `Use one ${label}`);
      decrement.textContent = "−";
      const value = document.createElement("strong");
      value.textContent = `${current} / ${max} left`;
      const increment = document.createElement("button");
      increment.type = "button";
      increment.dataset.action = "adjust-legendary";
      increment.dataset.kind = kind;
      increment.dataset.delta = "1";
      increment.setAttribute("aria-label", `Restore one ${label}`);
      increment.textContent = "+";
      counter.append(labelElement, decrement, value, increment);
      tracker.append(counter);
    });
    return tracker;
  }

  function createCombatantRow(combatant, displayIndex) {
    const isNpc = combatant.type === "npc";
    const statblock = getStatblockById(combatant.statblockId);
    const hasInitiative = numericInitiative(combatant.initiative) !== Number.NEGATIVE_INFINITY;
    const row = document.createElement("article");
    row.className = "combatant-row";
    row.dataset.id = combatant.id;
    row.dataset.type = combatant.type;
    row.classList.toggle("active-turn", combatant.id === state.activeId);
    row.classList.toggle("has-statblock", Boolean(statblock));

    const medallion = document.createElement("div");
    medallion.className = "combatant-order-medallion";
    medallion.setAttribute("aria-hidden", "true");
    medallion.textContent = hasInitiative ? String(displayIndex + 1) : "·";
    row.append(medallion);

    const nameWrap = document.createElement("div");
    nameWrap.className = "combatant-name-wrap";
    nameWrap.append(isNpc
      ? rowInput({ className: "combatant-name-input", field: "name", value: combatant.name, label: "NPC name" })
      : Object.assign(document.createElement("span"), { className: "combatant-name", textContent: combatant.name }));
    const type = document.createElement("span");
    type.className = "combatant-type";
    type.textContent = isNpc ? (statblock ? `${statblock.section} · ${statblock.source || "Statblock"}` : "Custom NPC") : "Player character · live sync";
    nameWrap.append(type);
    const concentratingTag = document.createElement("span");
    concentratingTag.className = "combatant-concentrating-tag";
    concentratingTag.textContent = "✦ Concentrating";
    nameWrap.append(concentratingTag);
    row.classList.toggle("is-concentrating", combatant.concentrating);
    if (statblock) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "statblock-toggle";
      toggle.dataset.action = "toggle-statblock";
      toggle.textContent = expandedStatblocks.has(combatant.id) ? "Hide" : "View";
      toggle.textContent += " statblock";
      nameWrap.append(toggle);
    }
    row.append(nameWrap);

    const initiativeWrap = document.createElement("div");
    initiativeWrap.className = "combatant-initiative";
    initiativeWrap.append(rowInput({ className: "initiative-input", field: "initiative", value: combatant.initiative, label: `Initiative for ${combatant.name}`, type: "number", inputmode: "numeric" }));
    row.append(initiativeWrap);

    const hpWrap = document.createElement("div");
    hpWrap.className = "combatant-hp";
    const hpFields = document.createElement("div");
    hpFields.className = "combatant-hp-fields";
    const divider = document.createElement("span");
    divider.className = "hp-divider";
    divider.textContent = "/";
    hpFields.append(rowInput({ className: "hp-current-input", field: "hpCurrent", value: combatant.hpCurrent, label: `Current HP for ${combatant.name}`, type: "number", inputmode: "numeric" }), divider, rowInput({ className: "hp-max-input", field: "hpMax", value: combatant.hpMax, label: `Maximum HP for ${combatant.name}`, type: "number", inputmode: "numeric" }));
    hpWrap.append(hpBarElement(combatant), hpFields);
    row.append(hpWrap);

    const acWrap = document.createElement("div");
    acWrap.className = "combatant-ac";
    acWrap.append(rowInput({ className: "ac-input", field: "armorClass", value: combatant.armorClass, label: `Armor Class for ${combatant.name}`, type: "number", inputmode: "numeric" }));
    row.append(acWrap);
    const conditions = createConditionEditor(combatant);
    row.append(conditions);

    const concentration = document.createElement("label");
    concentration.className = "combatant-concentration concentration-toggle";
    concentration.title = "Concentrating on a spell. Click to toggle.";
    const concentrationInput = document.createElement("input");
    concentrationInput.dataset.field = "concentrating";
    concentrationInput.type = "checkbox";
    concentrationInput.checked = combatant.concentrating;
    concentrationInput.setAttribute("aria-label", `${combatant.name} is concentrating`);
    const rune = document.createElement("span");
    rune.className = "concentration-rune";
    rune.setAttribute("aria-hidden", "true");
    rune.textContent = "✦";
    concentration.append(concentrationInput, rune);
    row.append(concentration);

    if (isNpc) {
      const remove = document.createElement("button");
      remove.className = "combatant-remove";
      remove.type = "button";
      remove.title = `Remove ${combatant.name}`;
      remove.setAttribute("aria-label", `Remove ${combatant.name}`);
      remove.dataset.action = "remove-npc";
      remove.textContent = "×";
      row.append(remove);
    } else {
      const absent = document.createElement("button");
      absent.className = "combatant-remove combatant-absent";
      absent.type = "button";
      absent.title = `${combatant.name} is not here: hide from the initiative order`;
      absent.setAttribute("aria-label", `Mark ${combatant.name} as absent`);
      absent.dataset.action = "mark-absent";
      absent.textContent = "–";
      row.append(absent);
    }
    const legendary = createLegendaryTracker(combatant);
    if (legendary) row.append(legendary);
    const expanded = createExpandedStatblock(combatant);
    if (expanded) row.append(expanded);
    return row;
  }

  function updateTrackerSummary(combatants) {
    const empty = document.getElementById("initiativeEmptyState");
    const round = document.getElementById("roundNumber");
    const activeText = document.getElementById("activeTurnText");
    if (!empty || !round || !activeText) return;
    empty.hidden = combatants.length > 0;
    round.textContent = String(state.round);
    const active = combatants.find(combatant => combatant.id === state.activeId);
    activeText.textContent = active ? active.name : "Add initiative values, then press Next Turn.";
    renderAbsentPlayers();
  }

  // Players marked absent are listed below the tracker so they can be brought back.
  function renderAbsentPlayers() {
    const bar = document.getElementById("absentPlayersBar");
    if (!bar) return;
    const absent = playerCharacters.filter(character => state.absentPlayers[character.id]);
    bar.hidden = !absent.length;
    bar.replaceChildren();
    if (!absent.length) return;
    const label = Object.assign(document.createElement("span"), { className: "absent-players-label", textContent: "Absent" });
    bar.append(label, ...absent.map(character => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "absent-player-chip";
      chip.dataset.restoreId = character.id;
      chip.title = `Bring ${character.name || "this player"} back into the initiative order`;
      chip.textContent = `${character.name || "Unnamed Character"} ↺`;
      return chip;
    }));
  }

  function markPlayerAbsent(id) {
    // If it was their turn, the turn passes to whoever is next.
    if (state.activeId === id) {
      const ordered = getInitiativeCombatants();
      const index = ordered.findIndex(combatant => combatant.id === id);
      const next = ordered[(index + 1) % ordered.length];
      state.activeId = next && next.id !== id ? next.id : "";
    }
    state.absentPlayers = { ...state.absentPlayers, [id]: true };
    persistTrackerState();
    renderTracker();
  }

  function restorePlayer(id) {
    const { [id]: removed, ...rest } = state.absentPlayers;
    state.absentPlayers = rest;
    persistTrackerState();
    renderTracker();
  }

  // Whoever's turn it is comes first; the rest follow in initiative order and wrap into the next round.
  function turnOrder(combatants) {
    const ranked = combatants.filter(combatant => numericInitiative(combatant.initiative) !== Number.NEGATIVE_INFINITY);
    const unranked = combatants.filter(combatant => numericInitiative(combatant.initiative) === Number.NEGATIVE_INFINITY);
    const start = ranked.findIndex(combatant => combatant.id === state.activeId);
    const rotated = start > 0 ? [...ranked.slice(start), ...ranked.slice(0, start)] : ranked;
    return { ordered: [...rotated, ...unranked], nextRoundStartId: start > 0 ? ranked[0].id : "" };
  }

  function renderTracker(options) {
    reconcileTracker(options);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function playerLivePatch(id) {
    return {
      ...(inFlightPlayerLivePatches.get(id) || {}),
      ...(pendingPlayerLivePatches.get(id) || {})
    };
  }

  function playerFieldIsProtected(id, field) {
    const patch = playerLivePatch(id);
    if (field === "hpCurrent" && hasOwn(patch, "hpCurrent")) return true;
    if (field === "hpMax" && hasOwn(patch, "hpOverride")) return true;
    if (field === "conditions" && hasOwn(patch, "conditions")) return true;

    const active = document.activeElement;
    const row = active?.closest(".combatant-row");
    if (!row || row.dataset.id !== id) return false;
    return field === "conditions"
      ? Boolean(active.closest(".combatant-conditions"))
      : active.dataset.field === field;
  }

  function mergeRefreshedPlayers(players) {
    const previousById = new Map(playerCharacters.map(character => [character.id, character]));
    return players.map(character => {
      const previous = previousById.get(character.id);
      if (!previous) return character;
      const merged = { ...character };
      if (playerFieldIsProtected(character.id, "hpCurrent")) merged.hpCurrent = previous.hpCurrent;
      if (playerFieldIsProtected(character.id, "hpMax")) merged.hpMax = previous.hpMax;
      if (playerFieldIsProtected(character.id, "conditions")) merged.currentConditions = previous.currentConditions;
      if (playerFieldIsProtected(character.id, "armorClass")) merged.armorClass = previous.armorClass;
      return merged;
    });
  }

  function setInputValueIfSafe(input, value, id, field) {
    if (!input || playerFieldIsProtected(id, field)) return;
    const nextValue = String(value ?? "");
    if (input.value !== nextValue) input.value = nextValue;
  }

  function updateHpBarElement(row) {
    const current = numericHp(row.querySelector('[data-field="hpCurrent"]')?.value);
    const max = numericHp(row.querySelector('[data-field="hpMax"]')?.value);
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
    const bar = row.querySelector(".combatant-hp-bar");
    if (!bar) return;
    bar.style.width = `${pct}%`;
    bar.classList.toggle("danger", pct > 0 && pct <= 50);
  }

  function createConditionEditor(combatant) {
    const container = document.createElement("div");
    container.className = "combatant-conditions";
    const conditions = normalizeConditionNames(combatant.currentConditions);
    const chips = document.createElement("div");
    chips.className = "combatant-condition-chips";

    if (conditions.length) {
      conditions.forEach(condition => {
        const chip = document.createElement("span");
        chip.className = `combatant-condition-chip${focusedConditions.get(combatant.id) === condition ? " active" : ""}`;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "combatant-condition-open";
        open.dataset.action = "show-condition";
        open.dataset.condition = condition;
        open.textContent = condition;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "combatant-condition-remove";
        remove.dataset.action = "remove-condition";
        remove.dataset.condition = condition;
        remove.setAttribute("aria-label", `Remove ${condition}`);
        remove.textContent = "×";
        chip.append(open, remove);
        chips.append(chip);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "combatant-condition-empty";
      empty.textContent = "No conditions";
      chips.append(empty);
    }
    container.append(chips);

    const picker = document.createElement("select");
    picker.className = "combatant-condition-picker";
    picker.dataset.action = "add-condition";
    picker.setAttribute("aria-label", `Add condition for ${combatant.name}`);
    const addOption = document.createElement("option");
    addOption.value = "";
    addOption.textContent = "Add condition…";
    picker.append(addOption);
    Object.keys(window.CONDITION_DETAILS || {}).forEach(condition => {
      const option = document.createElement("option");
      option.value = condition;
      option.textContent = condition;
      picker.append(option);
    });
    const customOption = document.createElement("option");
    customOption.value = CUSTOM_CONDITION_VALUE;
    customOption.textContent = "Custom condition…";
    picker.append(customOption);
    container.append(picker);

    const focused = focusedConditions.get(combatant.id);
    if (focused) {
      const info = document.createElement("aside");
      info.className = "combatant-condition-info";
      info.setAttribute("aria-live", "polite");
      const header = document.createElement("div");
      header.className = "combatant-condition-info-header";
      const title = document.createElement("strong");
      title.textContent = focused;
      const close = document.createElement("button");
      close.type = "button";
      close.dataset.action = "close-condition-info";
      close.setAttribute("aria-label", `Close ${focused} details`);
      close.textContent = "×";
      header.append(title, close);
      info.append(header);
      const details = window.CONDITION_DETAILS?.[focused];
      if (details?.length) {
        const list = document.createElement("ul");
        details.forEach(detail => {
          const item = document.createElement("li");
          item.textContent = detail;
          list.append(item);
        });
        info.append(list);
      } else {
        const text = document.createElement("p");
        text.textContent = "Custom condition. Add campaign-specific details to your notes.";
        info.append(text);
      }
      container.append(info);
    }
    return container;
  }

  function patchConditionEditor(row, combatant, { force = false } = {}) {
    const container = row.querySelector(".combatant-conditions");
    if (!container || (!force && playerFieldIsProtected(combatant.id, "conditions"))) return;
    const conditions = normalizeConditionNames(combatant.currentConditions);
    const current = [...container.querySelectorAll(".combatant-condition-open")].map(button => button.textContent);
    const focused = focusedConditions.get(combatant.id);
    if (focused && !conditions.some(condition => condition.toLowerCase() === focused.toLowerCase())) focusedConditions.delete(combatant.id);
    const nextFocused = focusedConditions.get(combatant.id);
    const infoTitle = container.querySelector(".combatant-condition-info strong")?.textContent || "";
    if (serializeConditionNames(current) === serializeConditionNames(conditions) && infoTitle === (nextFocused || "")) return;
    const replacement = createConditionEditor(combatant);
    container.replaceChildren(...replacement.childNodes);
  }

  function patchCombatantPosition(row, combatant, displayIndex) {
    row.classList.toggle("active-turn", combatant.id === state.activeId);
    const medallion = row.querySelector(".combatant-order-medallion");
    if (medallion) medallion.textContent = numericInitiative(combatant.initiative) === Number.NEGATIVE_INFINITY ? "·" : String(displayIndex + 1);
  }

  function patchCombatantFields(row, combatant, { forceConditions = false } = {}) {
    const name = row.querySelector(".combatant-name, .combatant-name-input");
    if (name && document.activeElement !== name && name.value !== undefined && name.value !== combatant.name) name.value = combatant.name;
    if (name && name.value === undefined && name.textContent !== combatant.name) name.textContent = combatant.name;
    const initiative = row.querySelector('[data-field="initiative"]');
    setInputValueIfSafe(initiative, combatant.initiative, combatant.id, "initiative");
    const hpCurrent = row.querySelector('[data-field="hpCurrent"]');
    const hpMax = row.querySelector('[data-field="hpMax"]');
    setInputValueIfSafe(hpCurrent, combatant.hpCurrent, combatant.id, "hpCurrent");
    setInputValueIfSafe(hpMax, combatant.hpMax, combatant.id, "hpMax");
    const armorClass = row.querySelector('[data-field="armorClass"]');
    setInputValueIfSafe(armorClass, combatant.armorClass, combatant.id, "armorClass");
    if (initiative) initiative.setAttribute("aria-label", `Initiative for ${combatant.name}`);
    if (hpCurrent) hpCurrent.setAttribute("aria-label", `Current HP for ${combatant.name}`);
    if (hpMax) hpMax.setAttribute("aria-label", `Maximum HP for ${combatant.name}`);
    if (armorClass) armorClass.setAttribute("aria-label", `Armor Class for ${combatant.name}`);
    updateHpBarElement(row);
    patchConditionEditor(row, combatant, { force: forceConditions });

    const concentration = row.querySelector('[data-field="concentrating"]');
    if (concentration && document.activeElement !== concentration) concentration.checked = combatant.concentrating;
    row.classList.toggle("is-concentrating", combatant.concentrating);
  }

  function patchPlayerRow(row, combatant, displayIndex, options) {
    patchCombatantPosition(row, combatant, displayIndex);
    patchCombatantFields(row, combatant, options);
  }

  function patchNpcRow(row, combatant, displayIndex, options) {
    patchCombatantPosition(row, combatant, displayIndex);
    patchCombatantFields(row, combatant, options);
    const statblock = getStatblockById(combatant.statblockId);
    row.classList.toggle("has-statblock", Boolean(statblock));
    const nameWrap = row.querySelector(".combatant-name-wrap");
    const type = row.querySelector(".combatant-type");
    if (type) type.textContent = statblock ? `${statblock.section} · ${statblock.source || "Statblock"}` : "Custom NPC";
    const toggle = nameWrap?.querySelector(".statblock-toggle");
    if (statblock && toggle) {
      toggle.textContent = expandedStatblocks.has(combatant.id) ? "Hide" : "View";
      toggle.textContent += " statblock";
    }
    const panel = row.querySelector(".inline-statblock");
    const shouldExpand = Boolean(statblock && expandedStatblocks.has(combatant.id));
    if (shouldExpand && !panel) row.append(createStatblockPanel(statblock, { closeButton: true }));
    if (!shouldExpand && panel) panel.remove();
    [["resistance", combatant.legendaryResistanceCurrent, combatant.legendaryResistanceMax], ["action", combatant.legendaryActionCurrent, combatant.legendaryActionMax]].forEach(([kind, current, max]) => {
      const value = row.querySelector(`.legendary-${kind} strong`);
      if (value) value.textContent = `${current} / ${max} left`;
    });
  }

  function shouldDeferTrackerReorder() {
    return Boolean(document.activeElement?.closest(".combatant-row"));
  }

  function scheduleTrackerReorderFrame() {
    if (trackerReorderFrame !== null) return;
    trackerReorderFrame = window.requestAnimationFrame(() => {
      trackerReorderFrame = null;
      if (!trackerReorderPending || shouldDeferTrackerReorder()) return;
      trackerReorderPending = false;
      reconcileTracker();
    });
  }

  function requestTrackerReorder() {
    trackerReorderPending = true;
    scheduleTrackerReorderFrame();
  }

  function retryTrackerReorderAfterFocusOut() {
    if (trackerReorderPending) scheduleTrackerReorderFrame();
  }

  function reconcileTracker({ forceConditionId = "" } = {}) {
    const list = document.getElementById("initiativeList");
    if (!list) return;
    const { ordered: combatants, nextRoundStartId } = turnOrder(getCombatants());
    const rowsById = new Map([...list.querySelectorAll(".combatant-row")].map(row => [row.dataset.id, row]));
    const existingRows = new Map(rowsById);
    const retainedIds = new Set();

    combatants.forEach(combatant => {
      let row = rowsById.get(combatant.id);
      if (row && row.dataset.type !== combatant.type) {
        row.remove();
        row = null;
      }
      if (!row) {
        row = createCombatantRow(combatant, 0);
        rowsById.set(combatant.id, row);
        list.append(row);
      }
      retainedIds.add(combatant.id);
    });

    existingRows.forEach((row, id) => { if (!retainedIds.has(id)) row.remove(); });

    const deferReorder = shouldDeferTrackerReorder();
    if (!deferReorder) {
      trackerReorderPending = false;
      combatants.forEach((combatant, displayIndex) => {
        const row = rowsById.get(combatant.id);
        const rowAtPosition = list.children[displayIndex];
        if (rowAtPosition !== row) list.insertBefore(row, rowAtPosition || null);
      });
    }

    combatants.forEach(combatant => {
      const row = rowsById.get(combatant.id);
      const displayIndex = [...list.children].indexOf(row);
      const options = { forceConditions: combatant.id === forceConditionId };
      if (combatant.type === "player") patchPlayerRow(row, combatant, displayIndex, options);
      else patchNpcRow(row, combatant, displayIndex, options);
      row.classList.toggle("starts-next-round", combatant.id === nextRoundStartId);
      row.dataset.nextRound = `Round ${state.round + 1}`;
    });
    updateTrackerSummary(combatants);
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

  function schedulePlayerLiveSave(id, patch) {
    pendingPlayerLivePatches.set(id, {
      ...(pendingPlayerLivePatches.get(id) || {}),
      ...patch
    });
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(async () => {
      saveTimers.delete(id);
      const character = playerCharacters.find(item => item.id === id);
      if (!character) return;
      const livePatch = pendingPlayerLivePatches.get(id) || {};
      pendingPlayerLivePatches.delete(id);
      inFlightPlayerLivePatches.set(id, {
        ...(inFlightPlayerLivePatches.get(id) || {}),
        ...livePatch
      });
      try {
        const result = await characterStorage.saveCharacterLive({ id, ...livePatch });
        const savedLive = result?.live || result;
        publishLiveUpdate({
          id,
          hpCurrent: savedLive?.hpCurrent ?? character.hpCurrent,
          hpMax: savedLive?.hpMax ?? character.hpMax,
          tempHp: savedLive?.tempHp ?? character.tempHp,
          armorClass: character.armorClass,
          currentConditions: serializeConditionNames(
            savedLive?.conditions || livePatch.conditions || normalizeConditionNames(character.currentConditions)
          ),
          live: savedLive,
          updatedAt: savedLive?.updatedAt || new Date().toISOString()
        });
      } catch (error) {
        pendingPlayerLivePatches.set(id, {
          ...livePatch,
          ...(pendingPlayerLivePatches.get(id) || {})
        });
        schedulePlayerLiveSave(id, {});
        console.warn("Could not save DM-screen player live state:", error.message);
      } finally {
        const inFlight = inFlightPlayerLivePatches.get(id) || {};
        Object.entries(livePatch).forEach(([field, value]) => {
          if (inFlight[field] === value) delete inFlight[field];
        });
        if (Object.keys(inFlight).length) inFlightPlayerLivePatches.set(id, inFlight);
        else inFlightPlayerLivePatches.delete(id);
      }
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
    else {
      updatePlayerSummaryLocally(id, { currentConditions });
      schedulePlayerLiveSave(id, { conditions });
    }
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
    if (field === "concentrating") row.classList.toggle("is-concentrating", Boolean(value));
    else {
      updatePlayerSummaryLocally(id, { [field]: String(value) });
      if (field === "hpCurrent") schedulePlayerLiveSave(id, { hpCurrent: String(value) });
      if (field === "hpMax") schedulePlayerLiveSave(id, { hpOverride: value === "" ? null : String(value) });
    }
    if (field === "hpCurrent" || field === "hpMax") refreshHpBar(row);
  }

  function commitTrackerField(event) {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    if (input.dataset.field === "initiative" || input.dataset.field === "name") requestTrackerReorder();
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
    renderTracker({ forceConditionId: id });
  }

  function removeCondition(row, condition) {
    if (!row || !condition) return;
    const { id, type } = row.dataset;
    const combatant = getCombatants().find(item => item.id === id);
    if (!combatant) return;
    updateCombatantConditions(id, type, normalizeConditionNames(combatant.currentConditions).filter(item => item.toLowerCase() !== condition.toLowerCase()));
    if (focusedConditions.get(id)?.toLowerCase() === condition.toLowerCase()) focusedConditions.delete(id);
    renderTracker({ forceConditionId: id });
  }

  function showCondition(row, condition) {
    if (!row || !condition) return;
    const id = row.dataset.id;
    if (focusedConditions.get(id) === condition) focusedConditions.delete(id); else focusedConditions.set(id, condition);
    renderTracker({ forceConditionId: id });
  }

  function addCustomNpc() {
    const npc = normalizeNpc({ id: createId(), name: "New NPC" });
    if (state.autoRollNpcInitiative) rollNpcInitiative(npc);
    state.npcs.push(npc);
    persistTrackerState();
    closeNpcPicker();
    renderTracker();
  }

  function addStatblockNpc(statblockId) {
    const statblock = getStatblockById(statblockId);
    if (!statblock) return;
    const lr = getLegendaryResistanceMax(statblock);
    const la = getLegendaryActionMax(statblock);
    const npc = normalizeNpc({
      id: createId(),
      name: statblock.name,
      hpCurrent: statblock.hp,
      hpMax: statblock.hp,
      armorClass: statblock.armorClass,
      statblockId: statblock.id,
      source: statblock.source || "SRD 5.2.1",
      legendaryResistanceMax: lr,
      legendaryResistanceCurrent: lr,
      legendaryActionMax: la,
      legendaryActionCurrent: la
    });
    if (state.autoRollNpcInitiative) rollNpcInitiative(npc);
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

  function adjustLegendary(row, kind, delta) {
    const id = row?.dataset.id || "";
    const npc = state.npcs.find(item => item.id === id);
    if (!npc) return;
    const field = kind === "resistance" ? "legendaryResistanceCurrent" : "legendaryActionCurrent";
    const maxField = kind === "resistance" ? "legendaryResistanceMax" : "legendaryActionMax";
    const max = toNumber(npc[maxField], 0);
    npc[field] = Math.max(0, Math.min(max, toNumber(npc[field], max) + delta));
    persistTrackerState();
    renderTracker();
  }

  function getInitiativeCombatants() { return getCombatants().filter(combatant => numericInitiative(combatant.initiative) !== Number.NEGATIVE_INFINITY); }

  function resetLegendaryActionsForTurn(activeId) {
    const npc = state.npcs.find(item => item.id === activeId);
    if (!npc) return;
    const normalized = normalizeNpc(npc);
    if (normalized.legendaryActionMax > 0) {
      npc.legendaryActionMax = normalized.legendaryActionMax;
      npc.legendaryActionCurrent = normalized.legendaryActionMax;
    }
  }

  function advanceTurn() {
    const combatants = getInitiativeCombatants();
    if (!combatants.length) { state.activeId = ""; persistTrackerState(); renderTracker(); return; }
    const currentIndex = combatants.findIndex(combatant => combatant.id === state.activeId);
    if (currentIndex < 0) state.activeId = combatants[0].id;
    else if (currentIndex === combatants.length - 1) { state.activeId = combatants[0].id; state.round += 1; }
    else state.activeId = combatants[currentIndex + 1].id;
    resetLegendaryActionsForTurn(state.activeId);
    persistTrackerState(); renderTracker();
  }

  function previousTurn() {
    const combatants = getInitiativeCombatants();
    if (!combatants.length) return;
    const currentIndex = combatants.findIndex(combatant => combatant.id === state.activeId);
    if (currentIndex > 0) state.activeId = combatants[currentIndex - 1].id;
    else if (currentIndex === 0 && state.round > 1) { state.activeId = combatants[combatants.length - 1].id; state.round -= 1; }
    else if (currentIndex < 0) state.activeId = combatants[combatants.length - 1].id;
    persistTrackerState(); renderTracker();
  }

  // NPC initiative is d20 plus the initiative bonus from its statblock (custom NPCs roll a plain d20).
  function rollNpcInitiative(npc) {
    const bonus = bonusToNumber(getStatblockById(npc.statblockId)?.initiative || "0");
    npc.initiative = String(1 + Math.floor(Math.random() * 20) + bonus);
  }

  function rollAllNpcInitiative() {
    const missing = state.npcs.filter(npc => String(npc.initiative ?? "").trim() === "");
    const targets = missing.length
      ? missing
      : state.npcs.length && confirm("Every NPC already has initiative. Re-roll initiative for all NPCs?") ? state.npcs : [];
    if (!targets.length) return;
    targets.forEach(rollNpcInitiative);
    persistTrackerState(); renderTracker();
  }

  function resetCombat() {
    if (!confirm("Reset initiative values, NPCs, concentration markers, active turn, and round number? Custom statblocks stay saved.")) return;
    state = { ...state, round: 1, activeId: "", playerInitiatives: {}, playerConcentration: {}, npcs: [] };
    // Absent players and the auto-roll setting are kept.
    focusedConditions.clear(); expandedStatblocks.clear(); persistTrackerState(); renderTracker();
  }

  function receiveLiveUpdate(payload) {
    if (!payload || payload.type !== "live-summary-updated" || !payload.id) return;
    const patch = {
      hpCurrent: payload.hpCurrent ?? "",
      hpMax: payload.hpMax ?? "",
      tempHp: payload.tempHp ?? "",
      armorClass: payload.armorClass ?? "",
      currentConditions: payload.currentConditions ?? ""
    };
    if (playerFieldIsProtected(payload.id, "hpCurrent")) delete patch.hpCurrent;
    if (playerFieldIsProtected(payload.id, "hpMax")) delete patch.hpMax;
    if (playerFieldIsProtected(payload.id, "armorClass")) delete patch.armorClass;
    if (playerFieldIsProtected(payload.id, "conditions")) delete patch.currentConditions;
    updatePlayerSummaryLocally(payload.id, patch);
    reconcileTracker();
  }

  async function refreshPlayers() {
    if (playersRefreshInFlight) return;
    playersRefreshInFlight = true;
    try {
      playerCharacters = mergeRefreshedPlayers(await characterStorage.listCharacterData());
      reconcileTracker();
    }
    catch (error) { console.warn("Could not refresh DM-screen characters:", error.message); }
    finally { playersRefreshInFlight = false; }
  }

  function startPolling() { clearInterval(pollTimer); pollTimer = setInterval(refreshPlayers, POLL_DELAY); }

  function uniqueSorted(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })); }
  function fillFilter(selectId, values) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const selected = select.value;
    const placeholder = select.options[0];
    select.replaceChildren();
    if (placeholder) select.append(placeholder);
    const options = uniqueSorted(values);
    options.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
    if (options.includes(selected)) select.value = selected;
  }

  async function fetchStatblockJson(url, required = false) {
    try {
      const response = await fetch(`${url}?cacheBust=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        if (required) throw new Error(`Could not load ${url}.`);
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (required) throw error;
      console.warn(error.message);
      return [];
    }
  }

  async function parseCustomStatblockResponse(response, fallbackMessage) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || fallbackMessage);
    return body;
  }

  async function loadCampaignCustomStatblocks() {
    const legacyLocal = Array.isArray(state.customStatblocks) ? state.customStatblocks : [];

    try {
      const response = await window.apiFetch(`/api/custom-statblocks?cacheBust=${Date.now()}`, { cache: "no-store" });
      const body = await parseCustomStatblockResponse(response, "Could not load campaign custom statblocks.");
      return combineStatblockLists(legacyLocal, Array.isArray(body) ? body : body.statblocks || []);
    } catch (error) {
      console.warn(error.message);
      return combineStatblockLists(legacyLocal);
    }
  }

  async function saveCampaignCustomStatblocks(statblocks) {
    const normalized = combineStatblockLists(statblocks).map(statblock => ({
      ...statblock,
      section: CUSTOM_MONSTER_SECTION,
      source: statblock.source || "Custom Monster"
    }));

    const response = await window.apiFetch("/api/custom-statblocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statblocks: normalized })
    });
    const body = await parseCustomStatblockResponse(response, "Could not save campaign custom statblocks.");
    return combineStatblockLists(Array.isArray(body) ? body : body.statblocks || normalized);
  }

  async function loadStatblockLibrary() {
    try {
      const [srdStatblocks, customStatblocks, campaignCustomStatblocks] = await Promise.all([
        fetchStatblockJson(STATBLOCK_LIBRARY_URL, true),
        fetchStatblockJson(CUSTOM_STATBLOCK_SEED_URL, false),
        loadCampaignCustomStatblocks()
      ]);
      statblockLibrary = srdStatblocks.map(normalizeStatblock);
      customStatblockLibrary = customStatblocks.map(normalizeStatblock);
      campaignCustomStatblockLibrary = campaignCustomStatblocks.map(normalizeStatblock);
      refreshStatblockFilters();
      renderStatblockResults();
    } catch (error) {
      console.warn(error.message);
      const results = document.getElementById("statblockResults");
      if (results) {
        const message = document.createElement("p");
        message.className = "initiative-empty-state";
        message.textContent = "Could not load the SRD statblock library.";
        results.replaceChildren(message);
      }
    }
  }

  function refreshStatblockFilters() {
    const all = getAllStatblocks();
    fillFilter("statblockSectionFilter", all.map(item => item.section));
    fillFilter("statblockTypeFilter", all.map(item => item.type));
    fillFilter("statblockSizeFilter", all.map(item => item.size));
    fillFilter("statblockCrFilter", all.map(item => item.challengeRating));
  }

  function normalizeSearchString(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’`]/g, "");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getSearchTokens(query) {
    return normalizeSearchString(query)
      .split(/[^a-z0-9]+/i)
      .map(token => token.trim())
      .filter(Boolean);
  }

  function tokenMatchesStatblock(token, statblock) {
    const name = normalizeSearchString(statblock.name);
    const compactToken = token.replace(/[^a-z0-9]+/g, "");
    const nameWords = name.split(/[^a-z0-9]+/i).filter(Boolean);

    if (compactToken) {
      const nameHasExactOrPlural = nameWords.some(word =>
        word === compactToken ||
        word === `${compactToken}s` ||
        word === `${compactToken}es`
      );
      if (nameHasExactOrPlural) return true;
      // Names match as you type, so "gob" finds Goblin and "cul" finds Cultist.
      if (nameWords.some(word => word.startsWith(compactToken))) return true;

      // Very short searches should not match the middle of unrelated names
      // such as Pirate or Triceratops. Allow suffix matches so Rat still finds
      // Wererat, but keep everything else exact.
      if (compactToken.length <= 3) {
        if (nameWords.some(word => word.endsWith(compactToken))) return true;
      } else if (name.replace(/[^a-z0-9]+/g, "").includes(compactToken)) {
        return true;
      }
    }

    const metadataCorpus = normalizeSearchString([
      statblock.type,
      statblock.alignment,
      statblock.section,
      statblock.source,
      statblock.description
    ].filter(Boolean).join(" "));
    const fullRulesCorpus = normalizeSearchString([metadataCorpus, statblock.text].filter(Boolean).join(" "));
    const corpus = token.length <= 3 ? metadataCorpus : fullRulesCorpus;

    const escaped = escapeRegExp(token);
    const exactOrPlural = new RegExp(`(^|[^a-z0-9])${escaped}(?:s|es)?(?=$|[^a-z0-9])`, "i");
    if (exactOrPlural.test(corpus)) return true;

    // For longer terms, allow prefix searching in rules text so "zomb" can
    // find Zombies. Very short terms stay exact and outside the rules text to
    // avoid noisy matches such as rat -> aberration/creature/restoration.
    if (token.length >= 4) {
      return new RegExp(`(^|[^a-z0-9])${escaped}`, "i").test(corpus);
    }

    return false;
  }

  function statblockMatchesSearch(statblock, query) {
    const trimmedQuery = normalizeSearchString(query).trim();
    if (!trimmedQuery) return true;

    const tokens = getSearchTokens(trimmedQuery);
    if (tokens.length === 1 && tokenMatchesStatblock(tokens[0], statblock)) return true;

    return tokens.length > 0 && tokens.every(token => tokenMatchesStatblock(token, statblock));
  }

  function statblockMatchesFilters(statblock) {
    const query = String(document.getElementById("statblockSearchInput")?.value || "").trim();
    const section = document.getElementById("statblockSectionFilter")?.value || "";
    const type = document.getElementById("statblockTypeFilter")?.value || "";
    const size = document.getElementById("statblockSizeFilter")?.value || "";
    const cr = document.getElementById("statblockCrFilter")?.value || "";

    return statblockMatchesSearch(statblock, query)
      && (!section || statblock.section === section)
      && (!type || statblock.type === type)
      && (!size || statblock.size === size)
      && (!cr || statblock.challengeRating === cr);
  }

  function createStatblockResult(statblock) {
    const card = document.createElement("article");
    card.className = "statblock-result-card";
    card.dataset.statblockId = statblock.id;
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = statblock.name;
    const subtitle = document.createElement("p");
    subtitle.textContent = `${statblock.size} ${statblock.type}, ${statblock.alignment}`;
    const source = document.createElement("small");
    source.textContent = `${statblock.section} · Speed ${statblock.speed || "—"}`;
    details.append(title, subtitle, statblockSummaryElement(statblock), source);
    const actions = document.createElement("div");
    actions.className = "statblock-result-actions";
    [["preview-statblock", "dm-subtle-button", "Preview"], ["edit-statblock", "dm-subtle-button", "Edit"], ["add-statblock-npc", "dm-primary-button", "Add"]].forEach(([action, className, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.dataset.action = action;
      button.dataset.statblockId = statblock.id;
      button.textContent = text;
      actions.append(button);
    });
    card.append(details, actions);
    return card;
  }

  function renderStatblockPreview(statblockId = selectedStatblockId) {
    const preview = document.getElementById("statblockPreview");
    if (!preview) return;
    const statblock = statblockId ? getStatblockById(statblockId) : null;
    selectedStatblockId = statblock?.id || "";
    if (statblock) {
      preview.replaceChildren(createStatblockPanel(statblock, { addButton: true, editButton: true }));
      return;
    }
    const message = document.createElement("p");
    message.className = "initiative-empty-state";
    message.textContent = "Select a statblock to preview its full rules before adding it.";
    preview.replaceChildren(message);
  }

  function renderStatblockResults() {
    const results = document.getElementById("statblockResults");
    const count = document.getElementById("statblockResultCount");
    if (!results || !count) return;
    const matching = getAllStatblocks().filter(statblockMatchesFilters);
    count.textContent = `${matching.length} statblock${matching.length === 1 ? "" : "s"}`;
    const matchingIds = new Set(matching.map(item => item.id));
    [...results.children].forEach(child => {
      if (!matchingIds.has(child.dataset.statblockId)) child.remove();
    });
    matching.forEach((statblock, index) => {
      let card = [...results.children].find(child => child.dataset.statblockId === statblock.id);
      if (!card) {
        card = createStatblockResult(statblock);
        results.append(card);
      } else {
        const replacement = createStatblockResult(statblock);
        card.replaceChildren(...replacement.childNodes);
      }
      card.classList.toggle("selected", selectedStatblockId === statblock.id);
      const current = results.children[index];
      if (current !== card) results.insertBefore(card, current || null);
    });
    if (!matching.length) {
      const message = document.createElement("p");
      message.className = "initiative-empty-state";
      message.textContent = "No statblocks match these filters.";
      results.append(message);
    }
    if (!matching.some(item => item.id === selectedStatblockId)) selectedStatblockId = "";
    renderStatblockPreview(selectedStatblockId);
  }

  function openNpcPicker() {
    const backdrop = document.getElementById("npcPickerBackdrop");
    if (!backdrop) return;
    backdrop.classList.remove("is-hidden");
    backdrop.setAttribute("aria-hidden", "false");
    refreshStatblockFilters();
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

  function openCustomStatblockPanel() {
    const panel = document.getElementById("customStatblockPanel");
    const modal = panel?.closest(".npc-picker-modal");
    if (!panel) return;
    panel.removeAttribute("hidden");
    modal?.classList.add("custom-builder-open");
    window.requestAnimationFrame(() => {
      panel.scrollIntoView({ block: "start", behavior: "smooth" });
      document.getElementById("customStatName")?.focus({ preventScroll: true });
    });
  }

  function closeCustomStatblockPanel() {
    const panel = document.getElementById("customStatblockPanel");
    panel?.setAttribute("hidden", "");
    panel?.closest(".npc-picker-modal")?.classList.remove("custom-builder-open");
  }

  function getFieldValue(id) {
    return String(document.getElementById(id)?.value || "").trim();
  }

  function clearCustomStatblockForm() {
    editingStatblockId = "";
    document.querySelectorAll("#customStatblockPanel input, #customStatblockPanel textarea").forEach(input => { if (input.type === "checkbox") input.checked = false; else input.value = ""; });
    document.querySelectorAll("#customStatblockPanel .builder-save-input").forEach(input => { delete input.dataset.custom; });
    document.querySelectorAll("#customStatblockPanel .builder-entry-list").forEach(list => list.replaceChildren());
    setCustomField("customStatSize", "Medium");
    const title = document.getElementById("customStatblockTitle");
    if (title) title.textContent = "Create Custom Statblock";
    const saveButton = document.getElementById("saveCustomStatblockBtn");
    if (saveButton) saveButton.textContent = "Save Statblock";
    refreshBuilder();
    document.getElementById("customStatName")?.focus();
  }

  function setCustomField(id, value) {
    const field = document.getElementById(id);
    if (!field) return;
    const nextValue = String(value ?? "");
    field.value = field.tagName === "TEXTAREA" ? normalizeEscapedLineBreaks(nextValue) : nextValue;
  }

  function getTextareaValue(id) {
    return normalizeStatblockTextareaValue(document.getElementById(id)?.value || "");
  }

  function averageFromDice(formula) {
    const match = String(formula || "").replace(/−/g, "-").match(/(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/i);
    if (!match) return 0;
    const bonus = match[3] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;
    return Math.max(1, Math.floor(Number(match[1]) * (Number(match[2]) + 1) / 2) + bonus);
  }

  function growTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  function addBuilderEntry(section, { name = "", text = "" } = {}, { after = null, focus = false } = {}) {
    const list = document.querySelector(`#customStatblockPanel .builder-entries[data-section="${section}"] .builder-entry-list`);
    if (!list) return null;
    const row = document.createElement("div");
    row.className = "builder-entry";
    const nameInput = document.createElement("input");
    nameInput.className = "builder-entry-name";
    nameInput.placeholder = section === "Traits" ? "Name, e.g. Spellcasting" : "Name, e.g. Multiattack";
    nameInput.setAttribute("aria-label", `${section} name`);
    nameInput.value = name;
    const textInput = document.createElement("textarea");
    textInput.className = "builder-entry-text";
    textInput.rows = 2;
    textInput.placeholder = "What it does. Each extra line becomes an indented paragraph. Ctrl+Enter adds another entry.";
    textInput.setAttribute("aria-label", `${section} description`);
    textInput.value = text;
    const tools = document.createElement("div");
    tools.className = "builder-entry-tools";
    [["up", "↑", "Move up"], ["down", "↓", "Move down"], ["remove", "×", "Remove"]].forEach(([action, label, aria]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.entryAction = action;
      button.setAttribute("aria-label", aria);
      button.textContent = label;
      tools.append(button);
    });
    row.append(nameInput, tools, textInput);
    if (after) after.after(row); else list.append(row);
    window.requestAnimationFrame(() => growTextarea(textInput));
    if (focus) nameInput.focus();
    return row;
  }

  function collectBuilderEntries(section) {
    return [...document.querySelectorAll(`#customStatblockPanel .builder-entries[data-section="${section}"] .builder-entry`)]
      .map(row => ({
        name: normalizeStatblockLine(row.querySelector(".builder-entry-name")?.value).replace(/[.:]+$/, ""),
        lines: String(row.querySelector(".builder-entry-text")?.value || "").split(/\r?\n/).map(normalizeStatblockLine).filter(Boolean)
      }))
      .filter(entry => entry.name || entry.lines.length)
      .map(({ name, lines }) => [name ? `${name}. ${lines[0] || ""}`.trim() : lines[0], ...lines.slice(1)].filter(Boolean).join("\n"));
  }

  function builderAbilityScores() {
    return ABILITY_LABELS.map(label => [label, getFieldValue(`customStat${label}`) || "10"]);
  }

  function builderProficiencyBonus() {
    return toNumber(getFieldValue("customStatPb"), challengeToProficiencyBonus(getFieldValue("customStatCr") || "0"));
  }

  function builderAutoSave(label, proficiencyBonus) {
    const proficient = document.querySelector(`input[name="customSaveProficiency"][value="${label}"]`)?.checked;
    return abilityModifierNumber(getFieldValue(`customStat${label}`) || "10") + (proficient ? proficiencyBonus : 0);
  }

  function refreshBuilderDerived() {
    const proficiencyBonus = builderProficiencyBonus();
    const dexMod = abilityModifierNumber(getFieldValue("customStatDex") || "10");
    ABILITY_LABELS.forEach(label => {
      const mod = document.getElementById(`customStat${label}Mod`);
      if (mod) mod.textContent = displaySigned(formatBonus(abilityModifierNumber(getFieldValue(`customStat${label}`) || "10")));
      const save = document.getElementById(`customStat${label}Save`);
      if (!save) return;
      const auto = formatBonus(builderAutoSave(label, proficiencyBonus));
      save.placeholder = auto;
      if (!save.dataset.custom && document.activeElement !== save) save.value = auto;
      save.classList.toggle("is-manual", Boolean(save.dataset.custom));
    });
    const placeholders = {
      customStatPb: String(challengeToProficiencyBonus(getFieldValue("customStatCr") || "0")),
      customStatInitiative: formatBonus(dexMod),
      customStatAc: String(10 + dexMod),
      customStatHp: String(averageFromDice(getFieldValue("customStatHpFormula")) || "1")
    };
    Object.entries(placeholders).forEach(([id, value]) => { const field = document.getElementById(id); if (field) field.placeholder = value; });
  }

  let builderPreviewFrame = 0;
  function refreshBuilder() {
    refreshBuilderDerived();
    if (builderPreviewFrame) return;
    builderPreviewFrame = window.requestAnimationFrame(() => {
      builderPreviewFrame = 0;
      document.getElementById("statblockBuilderPreview")?.replaceChildren(createStatblockPanel(buildCustomStatblockFromForm()));
    });
  }

  function fillBuilderFromStatblock(statblock) {
    const structured = parseStructuredStatblock(statblock);
    const abilityMap = new Map(structured.abilities.map(ability => [ability.name.toLowerCase(), ability]));
    const sectionByTitle = new Map(structured.sections.map(section => [section.title, section]));
    const proficiencyBonus = getProficiencyBonus(statblock);
    const inferredSkills = inferSkillsFromMetadata(structured.metadata, structured.abilities, proficiencyBonus);
    const inferredSaves = inferSaveProficiencies(structured.abilities, proficiencyBonus);
    const metaValues = labels => structured.metadata.filter(item => labels.includes(item.label)).map(item => item.value).filter(Boolean).join("; ");
    const perceptionBonus = (metaValues(["Skills"]).match(/Perception\s*([+−-]\s*\d+)/i) || [])[1];
    const passive = 10 + (perceptionBonus ? bonusToNumber(perceptionBonus) : abilityModifierNumber(abilityMap.get("wis")?.score || 10));
    const senses = metaValues(["Senses"]).replace(new RegExp(`[;,]?\\s*passive perception ${passive}\\b`, "i"), "").replace(/^[;,\s]+|[;,\s]+$/g, "");

    clearCustomStatblockForm();
    setCustomField("customStatName", statblock.name);
    setCustomField("customStatSize", ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"].find(size => String(statblock.size).startsWith(size)) || "Medium");
    setCustomField("customStatType", statblock.type);
    setCustomField("customStatAlignment", statblock.alignment);
    setCustomField("customStatDescription", statblock.description || "");
    setCustomField("customStatAc", statblock.armorClass);
    setCustomField("customStatArmor", structured.armorNote);
    setCustomField("customStatHp", statblock.hp);
    setCustomField("customStatHpFormula", statblock.hpFormula);
    setCustomField("customStatInitiative", statblock.initiative);
    setCustomField("customStatSpeed", statblock.speed);
    setCustomField("customStatCr", statblock.challengeRating);
    setCustomField("customStatPb", proficiencyBonus === challengeToProficiencyBonus(statblock.challengeRating) ? "" : proficiencyBonus);
    setCustomField("customStatLegendaryResistance", getLegendaryResistanceMax(statblock) || "");
    setCustomField("customStatLegendaryActions", getLegendaryActionMax(statblock) || "");
    ABILITY_LABELS.forEach(label => setCustomField(`customStat${label}`, abilityMap.get(label.toLowerCase())?.score || "10"));
    setCheckedValues("customSaveProficiency", statblock.saveProficiencies?.length ? statblock.saveProficiencies : inferredSaves);
    ABILITY_LABELS.forEach(label => {
      const ability = abilityMap.get(label.toLowerCase());
      const save = document.getElementById(`customStat${label}Save`);
      if (!ability || !save || bonusToNumber(ability.save) === builderAutoSave(label, proficiencyBonus)) return;
      save.value = formatBonus(bonusToNumber(ability.save));
      save.dataset.custom = "1";
    });
    setCustomField("customStatSkillProficiencies", (statblock.skillProficiencies?.length ? statblock.skillProficiencies : inferredSkills.proficient).join(", "));
    setCustomField("customStatSkillExpertise", (statblock.skillExpertise?.length ? statblock.skillExpertise : inferredSkills.expert).join(", "));
    setCustomField("customStatResistances", metaValues(["Resistances", "Damage Resistances"]));
    setCustomField("customStatVulnerabilities", metaValues(["Vulnerabilities", "Damage Vulnerabilities"]));
    setCustomField("customStatImmunities", metaValues(["Immunities", "Damage Immunities", "Condition Immunities"]));
    setCustomField("customStatSenses", senses);
    setCustomField("customStatLanguages", metaValues(["Languages"]));
    setCustomField("customStatGear", metaValues(["Gear"]));
    STATBLOCK_SECTION_HEADINGS.forEach(sectionTitle => {
      (sectionByTitle.get(sectionTitle)?.entries || []).forEach(entry => {
        const combined = `${entry.title || ""} ${entry.text || ""}`.trim();
        if (sectionTitle === "Traits" && /^Legendary Resistance\b/i.test(combined)) return;
        if (sectionTitle === "Legendary Actions" && /^(?:Legendary Action Uses\b|\S+(?: \S+)? can take \d+ legendary actions?)/i.test(combined)) return;
        addBuilderEntry(sectionTitle, { name: entry.title, text: [entry.text, ...(entry.more || [])].filter(Boolean).join("\n") });
      });
    });
    refreshBuilder();
  }

  function openStatblockEditor(statblockId) {
    const statblock = getStatblockById(statblockId);
    if (!statblock) return;
    const isCustom = isCustomStatblock(statblock);
    fillBuilderFromStatblock(statblock);
    editingStatblockId = isCustom ? statblock.id : "";
    const title = document.getElementById("customStatblockTitle");
    const saveButton = document.getElementById("saveCustomStatblockBtn");
    if (title) title.textContent = isCustom ? `Edit ${statblock.name}` : `Edit ${statblock.name} as Custom`;
    if (saveButton) saveButton.textContent = isCustom ? "Save Changes" : "Save Custom Copy";
    openCustomStatblockPanel();
  }

  function titleCase(value) {
    return String(value || "").replace(/\b([a-z])([a-z]*)/g, (word, first, rest, offset) => (offset > 0 && ["of", "and", "or", "the", "in", "to", "from"].includes(word)) ? word : first.toUpperCase() + rest);
  }

  // Maps a monster saved from the Tetra-cube statblock generator (tetra-cube.com/dnd/dnd-statblock.html) onto the builder.
  function importTetraCubeMonster(data) {
    const scores = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, Number.parseInt(data[`${key}Points`], 10) || 10]));
    const mods = Object.fromEntries(Object.entries(scores).map(([key, score]) => [key, abilityModifierNumber(score)]));
    const customCr = data.cr === "*";
    const challengeRating = customCr ? String(data.customCr || "0").trim().split(/\s+/)[0] : String(data.cr ?? "0");
    const proficiencyBonus = customCr ? toNumber(data.customProf, 2) : challengeToProficiencyBonus(challengeRating);
    const shortName = String(data.shortName || "").trim() || String(data.name || "monster").toLowerCase();
    const expand = value => String(value || "")
      .replace(/\[MON\]/g, `The ${shortName}`)
      .replace(/\[mon\]/g, `the ${shortName}`)
      .replace(/\[(STR|DEX|CON|INT|WIS|CHA)?\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\]/gi, (_match, stat, count, die, sign, extra) => {
        const bonus = (stat ? mods[stat.toLowerCase()] : 0) + (extra ? Number(extra) * (sign === "-" ? -1 : 1) : 0);
        return `${Math.max(1, Math.floor(Number(count) * (Number(die) + 1) / 2) + bonus)} (${count}d${die}${bonus ? ` ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}` : ""})`;
      })
      .replace(/(DC\s*)?\[(STR|DEX|CON|INT|WIS|CHA)\s+SAVE\]/gi, (_match, _dc, stat) => `DC ${8 + proficiencyBonus + mods[stat.toLowerCase()]}`)
      .replace(/\[(STR|DEX|CON|INT|WIS|CHA)\s+ATK\]/gi, (_match, stat) => formatBonus(proficiencyBonus + mods[stat.toLowerCase()]))
      .replace(/\[(STR|DEX|CON|INT|WIS|CHA)\]/gi, (_match, stat) => formatBonus(mods[stat.toLowerCase()]))
      .replace(/\*\*|__|(^|\s)_|_(?=\s|[.,;:]|$)/g, "$1");
    const list = items => Array.isArray(items) ? items : [];

    const armorTable = { "padded armor": [11, 99], "leather armor": [11, 99], "studded leather": [12, 99], "hide armor": [12, 2], "chain shirt": [13, 2], "scale mail": [14, 2], breastplate: [14, 2], "half plate": [15, 2], "ring mail": [14, 0], "chain mail": [16, 0], splint: [17, 0], plate: [18, 0] };
    const armorName = String(data.armorName || "none").toLowerCase();
    let armorClass = 10 + mods.dex;
    let armorNote = "";
    if (armorName === "natural armor") { armorClass += toNumber(data.natArmorBonus, 0); armorNote = "natural armor"; }
    else if (armorName === "mage armor") { armorClass = 13 + mods.dex; armorNote = "mage armor"; }
    else if (armorName === "other") { armorClass = Number.parseInt(data.otherArmorDesc, 10) || armorClass; armorNote = (String(data.otherArmorDesc || "").match(/\((.+)\)/) || [])[1] || ""; }
    else if (armorTable[armorName]) { armorClass = armorTable[armorName][0] + Math.min(mods.dex, armorTable[armorName][1]); armorNote = armorName; }
    if (toNumber(data.shieldBonus, 0)) { armorClass += toNumber(data.shieldBonus, 0); armorNote = [armorNote, "shield"].filter(Boolean).join(", "); }

    let hp = "";
    let hpFormula = "";
    if (data.customHP) {
      hp = String(Number.parseInt(data.hpText, 10) || "");
      hpFormula = (String(data.hpText || "").match(/\((.+)\)/) || [])[1] || "";
    } else {
      const count = toNumber(data.hitDice, 1) || 1;
      const die = { tiny: 4, small: 6, medium: 8, large: 10, huge: 12, gargantuan: 20 }[String(data.size || "medium").toLowerCase()] || 8;
      const bonus = count * mods.con;
      hpFormula = `${count}d${die}${bonus ? ` ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}` : ""}`;
      hp = String(averageFromDice(hpFormula));
    }
    const speed = data.customSpeed ? String(data.speedDesc || "") : [
      `${toNumber(data.speed, 0)} ft.`,
      toNumber(data.burrowSpeed, 0) ? `Burrow ${data.burrowSpeed} ft.` : "",
      toNumber(data.climbSpeed, 0) ? `Climb ${data.climbSpeed} ft.` : "",
      toNumber(data.flySpeed, 0) ? `Fly ${data.flySpeed} ft.${data.hover ? " (hover)" : ""}` : "",
      toNumber(data.swimSpeed, 0) ? `Swim ${data.swimSpeed} ft.` : ""
    ].filter(Boolean).join(", ");

    const skills = list(data.skills);
    const damage = type => [
      ...list(data.damagetypes).filter(item => item.type === type).map(item => titleCase(item.name)),
      ...list(data.specialdamage).filter(item => item.type === type).map(item => item.name)
    ].filter(Boolean);
    const immunities = [damage("i").join(", "), list(data.conditions).map(item => titleCase(item.name)).join(", ")].filter(Boolean).join("; ");
    const senses = [
      toNumber(data.blindsight, 0) ? `Blindsight ${data.blindsight} ft.${data.blind ? " (blind beyond this radius)" : ""}` : "",
      toNumber(data.darkvision, 0) ? `Darkvision ${data.darkvision} ft.` : "",
      toNumber(data.tremorsense, 0) ? `Tremorsense ${data.tremorsense} ft.` : "",
      toNumber(data.truesight, 0) ? `Truesight ${data.truesight} ft.` : ""
    ].filter(Boolean).join(", ");
    const spoken = list(data.languages).filter(item => item.speaks !== false).map(item => item.name);
    const understood = list(data.languages).filter(item => item.speaks === false).map(item => item.name);
    const languages = [
      spoken.join(", "),
      understood.length ? `understands ${understood.join(", ")} but can't speak${data.understandsBut ? ` ${data.understandsBut}` : ""}` : "",
      toNumber(data.telepathy, 0) ? `telepathy ${data.telepathy} ft.` : ""
    ].filter(Boolean).join("; ");

    clearCustomStatblockForm();
    setCustomField("customStatName", data.name || "Imported Monster");
    setCustomField("customStatSize", titleCase(data.size || "medium"));
    setCustomField("customStatType", `${titleCase(data.type || "creature")}${data.tag ? ` (${data.tag})` : ""}`);
    setCustomField("customStatAlignment", titleCase(data.alignment || "unaligned"));
    setCustomField("customStatAc", armorClass);
    setCustomField("customStatArmor", armorNote);
    setCustomField("customStatHp", hp);
    setCustomField("customStatHpFormula", hpFormula);
    setCustomField("customStatSpeed", speed);
    setCustomField("customStatCr", challengeRating);
    setCustomField("customStatPb", proficiencyBonus === challengeToProficiencyBonus(challengeRating) ? "" : proficiencyBonus);
    ABILITY_LABELS.forEach(label => setCustomField(`customStat${label}`, scores[label.toLowerCase()]));
    setCheckedValues("customSaveProficiency", list(data.sthrows).map(item => titleCase(item.name)));
    setCustomField("customStatSkillProficiencies", skills.filter(item => !/ex/i.test(item.note || "")).map(item => titleCase(item.name)).join(", "));
    setCustomField("customStatSkillExpertise", skills.filter(item => /ex/i.test(item.note || "")).map(item => titleCase(item.name)).join(", "));
    setCustomField("customStatResistances", damage("r").join(", "));
    setCustomField("customStatVulnerabilities", damage("v").join(", "));
    setCustomField("customStatImmunities", immunities);
    setCustomField("customStatSenses", senses);
    setCustomField("customStatLanguages", languages);

    list(data.abilities).forEach(item => {
      const resistance = String(item.name || "").match(/^Legendary Resistance\s*\((\d+)\s*\/\s*Day\)/i);
      if (resistance) { setCustomField("customStatLegendaryResistance", resistance[1]); return; }
      addBuilderEntry("Traits", { name: expand(item.name), text: expand(item.desc) });
    });
    [["actions", "Actions"], ["bonusActions", "Bonus Actions"], ["reactions", "Reactions"]].forEach(([key, section]) => list(data[key]).forEach(item => addBuilderEntry(section, { name: expand(item.name), text: expand(item.desc) })));
    if (data.isLegendary && list(data.legendaries).length) {
      setCustomField("customStatLegendaryActions", (String(data.legendariesDescription || "").match(/take (\d+) legendary actions?/i) || [])[1] || 3);
      list(data.legendaries).forEach(item => addBuilderEntry("Legendary Actions", { name: expand(item.name), text: expand(item.desc) }));
    }
    if (data.isMythic && list(data.mythics).length) {
      addBuilderEntry("Legendary Actions", { text: expand(data.mythicDescription) });
      list(data.mythics).forEach(item => addBuilderEntry("Legendary Actions", { name: expand(item.name), text: expand(item.desc) }));
    }
    if (data.isLair && list(data.lairs).length) {
      addBuilderEntry("Lair Actions", { text: expand(data.lairDescription) });
      list(data.lairs).forEach(item => addBuilderEntry("Lair Actions", { text: `• ${expand(item.desc || item.name)}` }));
      if (data.lairDescriptionEnd) addBuilderEntry("Lair Actions", { text: expand(data.lairDescriptionEnd) });
    }
    if (data.isRegional && list(data.regionals).length) {
      addBuilderEntry("Lair Actions", { name: "Regional Effects", text: [expand(data.regionalDescription), ...list(data.regionals).map(item => `• ${expand(item.desc || item.name)}`), expand(data.regionalDescriptionEnd)].filter(Boolean).join("\n") });
    }
    const title = document.getElementById("customStatblockTitle");
    if (title) title.textContent = `Import ${data.name || "Monster"}`;
    refreshBuilder();
  }

  async function importStatblockFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data && typeof data.text === "string" && data.name) fillBuilderFromStatblock(normalizeStatblock({ ...data, id: "", section: CUSTOM_MONSTER_SECTION }));
      else if (data && typeof data === "object" && "strPoints" in data) importTetraCubeMonster(data);
      else throw new Error("This file is not a Tetra-cube .monster file.");
      editingStatblockId = "";
      openCustomStatblockPanel();
    } catch (error) {
      console.error(error);
      alert(error.message?.startsWith("This file") ? error.message : "Could not read this .monster file.");
    }
  }

  function buildCustomStatblockFromForm() {
    const name = getFieldValue("customStatName") || "Custom Monster";
    const size = getFieldValue("customStatSize") || "Medium";
    const type = getFieldValue("customStatType") || "Creature";
    const alignment = getFieldValue("customStatAlignment") || "Unaligned";
    const description = getTextareaValue("customStatDescription");
    const abilities = builderAbilityScores();
    const abilityScores = abilityScoreMapFromPairs(abilities);
    const dexMod = abilityModifierNumber(abilityScores.get("dex"));
    const armorClass = getFieldValue("customStatAc") || String(10 + dexMod);
    const armorNote = getFieldValue("customStatArmor");
    const hpFormula = getFieldValue("customStatHpFormula");
    const hp = getFieldValue("customStatHp") || String(averageFromDice(hpFormula) || 1);
    const initiative = getFieldValue("customStatInitiative") || formatBonus(dexMod);
    const speed = getFieldValue("customStatSpeed") || "30 ft.";
    const challengeRating = getFieldValue("customStatCr") || "0";
    const proficiencyBonus = builderProficiencyBonus();
    const saveProficiencies = selectedCheckboxValues("customSaveProficiency");
    const skillProficiencies = parseCommaList(getFieldValue("customStatSkillProficiencies"));
    const skillExpertise = parseCommaList(getFieldValue("customStatSkillExpertise"));
    const lr = toNumber(getFieldValue("customStatLegendaryResistance"), 0);
    const la = toNumber(getFieldValue("customStatLegendaryActions"), 0);
    const abilityLines = abilities.map(([label, score]) => {
      const saveField = document.getElementById(`customStat${label}Save`);
      const save = saveField?.dataset.custom && saveField.value.trim() ? bonusToNumber(saveField.value) : builderAutoSave(label, proficiencyBonus);
      return `${label} ${score} ${formatBonus(abilityModifierNumber(score))} ${formatBonus(save)}`;
    }).join("\n");
    const skillsLine = buildSkillsLine(skillProficiencies, skillExpertise, abilityScores, proficiencyBonus);
    const perception = (skillsLine.match(/Perception ([+-]\d+)/) || [])[1];
    const passive = 10 + (perception ? bonusToNumber(perception) : abilityModifierNumber(abilityScores.get("wis")));
    const sensesField = getFieldValue("customStatSenses");
    const senses = /passive perception/i.test(sensesField) ? sensesField : [sensesField, `Passive Perception ${passive}`].filter(Boolean).join("; ");
    const meta = [
      skillsLine,
      getFieldValue("customStatVulnerabilities") ? `Vulnerabilities ${getFieldValue("customStatVulnerabilities")}` : "",
      getFieldValue("customStatResistances") ? `Resistances ${getFieldValue("customStatResistances")}` : "",
      getFieldValue("customStatImmunities") ? `Immunities ${getFieldValue("customStatImmunities")}` : "",
      getFieldValue("customStatGear") ? `Gear ${getFieldValue("customStatGear")}` : "",
      `Senses ${senses}`,
      getFieldValue("customStatLanguages") ? `Languages ${getFieldValue("customStatLanguages")}` : ""
    ].filter(Boolean).join("\n");
    const legendaryResistanceText = lr ? `Legendary Resistance (${lr}/Day). If it fails a saving throw, it can choose to succeed instead.` : "";
    const legendaryHeader = la ? `It can take ${la} legendary actions, choosing from the options below. Only one legendary action can be used at a time and only at the end of another creature’s turn. It regains spent legendary actions at the start of its turn.` : "";
    const sectionText = (heading, lines) => lines.filter(Boolean).length ? `${heading}\n${lines.filter(Boolean).join("\n")}` : "";
    const sections = [
      `${name}\n${size} ${type}, ${alignment}\nAC ${armorClass}${armorNote ? ` (${armorNote})` : ""}\nInitiative ${initiative}\nHP ${hp}${hpFormula ? ` (${hpFormula})` : ""}\nSpeed ${speed}\nMOD SAVE\n${abilityLines}\n${meta}\nCR ${challengeRating} (PB ${formatBonus(proficiencyBonus)})`,
      sectionText("Traits", [legendaryResistanceText, ...collectBuilderEntries("Traits")]),
      sectionText("Actions", collectBuilderEntries("Actions")),
      sectionText("Bonus Actions", collectBuilderEntries("Bonus Actions")),
      sectionText("Reactions", collectBuilderEntries("Reactions")),
      sectionText("Legendary Actions", [legendaryHeader, ...collectBuilderEntries("Legendary Actions")]),
      sectionText("Lair Actions", collectBuilderEntries("Lair Actions"))
    ];
    return normalizeStatblock({
      id: editingStatblockId || createId("custom-statblock"),
      name,
      section: CUSTOM_MONSTER_SECTION,
      size,
      type,
      alignment,
      armorClass,
      initiative,
      hp,
      hpFormula,
      speed,
      challengeRating,
      proficiencyBonus,
      text: sections.filter(Boolean).join("\n"),
      source: "Custom Monster",
      description,
      legendaryResistanceMax: lr,
      legendaryActionMax: la,
      saveProficiencies,
      skillProficiencies,
      skillExpertise
    });
  }

  function handleBuilderInput(event) {
    const target = event.target;
    if (target.matches(".builder-save-input")) {
      if (target.value.trim()) target.dataset.custom = "1"; else delete target.dataset.custom;
    }
    if (target.matches(".builder-entry-text")) growTextarea(target);
    // Typing "Name. Description" (or "Name: Description") into the name box splits it into both fields.
    const nameSplit = event.type === "change" && target.matches(".builder-entry-name") ? target.value.match(/^([^.!?:]{1,92})[.:]\s+(.+)$/) : null;
    const entryText = target.closest(".builder-entry")?.querySelector(".builder-entry-text");
    if (nameSplit && entryText && !entryText.value.trim() && looksLikeStatblockEntryTitle(nameSplit[1])) {
      target.value = nameSplit[1].trim();
      entryText.value = nameSplit[2].trim();
      growTextarea(entryText);
    }
    if (event.type === "change" && target.matches('input[name="customSaveProficiency"]')) delete document.getElementById(`customStat${target.value}Save`)?.dataset.custom;
    if (event.type === "change" && target.matches(".builder-save-input") && target.dataset.custom && bonusToNumber(target.value) === builderAutoSave(target.dataset.ability, builderProficiencyBonus())) delete target.dataset.custom;
    if (target.id === "statblockImportInput") return;
    refreshBuilder();
  }

  function handleBuilderClick(event) {
    const addButton = event.target.closest(".builder-add-entry");
    if (addButton) { addBuilderEntry(addButton.dataset.section, {}, { focus: true }); refreshBuilder(); return; }
    const tool = event.target.closest("[data-entry-action]");
    const row = tool?.closest(".builder-entry");
    if (!row) return;
    if (tool.dataset.entryAction === "up" && row.previousElementSibling) row.previousElementSibling.before(row);
    if (tool.dataset.entryAction === "down" && row.nextElementSibling) row.nextElementSibling.after(row);
    if (tool.dataset.entryAction === "remove") row.remove();
    refreshBuilder();
  }

  function handleBuilderKeydown(event) {
    const row = event.target.closest(".builder-entry");
    if (!row || event.key !== "Enter") return;
    const section = row.closest(".builder-entries")?.dataset.section || "";
    if (event.target.matches(".builder-entry-name") && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      row.querySelector(".builder-entry-text")?.focus();
    } else if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      addBuilderEntry(section, {}, { after: row, focus: true });
      refreshBuilder();
    }
  }

  // Pasting several "Name. Description" lines into a name field splits them into separate entries.
  function handleBuilderPaste(event) {
    const input = event.target;
    if (!input.matches?.(".builder-entry-name")) return;
    const pasted = event.clipboardData?.getData("text") || "";
    const entries = splitStatblockEntries(pasted, { linePerEntry: true });
    if (!/\n/.test(pasted.trim()) && !(entries.length === 1 && entries[0].title && entries[0].text)) return;
    event.preventDefault();
    const row = input.closest(".builder-entry");
    const section = row.closest(".builder-entries").dataset.section;
    let previous = row;
    entries.forEach((entry, index) => {
      const values = { name: entry.title, text: [entry.text, ...entry.more].filter(Boolean).join("\n") };
      if (index === 0 && !row.querySelector(".builder-entry-text").value.trim()) {
        input.value = values.name;
        row.querySelector(".builder-entry-text").value = values.text;
        growTextarea(row.querySelector(".builder-entry-text"));
      } else previous = addBuilderEntry(section, values, { after: previous });
    });
    refreshBuilder();
  }

  async function saveCustomStatblock({ addToTracker = false } = {}) {
    const statblock = buildCustomStatblockFromForm();
    const saveButtons = [document.getElementById("saveCustomStatblockBtn"), document.getElementById("saveAddCustomStatblockBtn")].filter(Boolean);
    const originalButtonText = new Map(saveButtons.map(button => [button, button.textContent]));
    saveButtons.forEach(button => { button.disabled = true; button.textContent = "Saving…"; });

    try {
      const nextCustomStatblocks = combineStatblockLists(campaignCustomStatblockLibrary.filter(item => item.id !== statblock.id), statblock);
      campaignCustomStatblockLibrary = await saveCampaignCustomStatblocks(nextCustomStatblocks);
      state.customStatblocks = (state.customStatblocks || []).filter(item => item.id !== statblock.id);
      editingStatblockId = statblock.id;
      persistTrackerState();
      refreshStatblockFilters();
      selectedStatblockId = statblock.id;
      renderStatblockResults();
      closeCustomStatblockPanel();
      if (addToTracker) addStatblockNpc(statblock.id);
    } catch (error) {
      console.error(error);
      alert(error.message || "Could not save this custom statblock for the campaign.");
    } finally {
      saveButtons.forEach(button => { button.disabled = false; button.textContent = originalButtonText.get(button) || "Save Statblock"; });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    state.npcs = state.npcs.map(normalizeNpc);
    state.customStatblocks = Array.isArray(state.customStatblocks) ? state.customStatblocks.map(normalizeStatblock) : [];
    persistTrackerState();

    const list = document.getElementById("initiativeList");
    list?.addEventListener("input", handleTrackerInput);
    list?.addEventListener("change", event => {
      const picker = event.target.closest('[data-action="add-condition"]');
      if (picker) { addCondition(picker.closest(".combatant-row"), picker.value); return; }
      handleTrackerInput(event);
      commitTrackerField(event);
    });
    list?.addEventListener("focusout", retryTrackerReorderAfterFocusOut);
    list?.addEventListener("click", event => {
      const row = event.target.closest(".combatant-row");
      const actionElement = event.target.closest("[data-action]");
      const action = actionElement?.dataset.action;
      if (!row) return;
      if (!action && row.classList.contains("has-statblock") && !event.target.closest("input, textarea, select, button, label, .inline-statblock, .legendary-tracker")) {
        const id = row.dataset.id || "";
        if (expandedStatblocks.has(id)) expandedStatblocks.delete(id); else expandedStatblocks.add(id);
        renderTracker();
        return;
      }
      if (!action) return;
      if (action === "remove-npc") removeNpc(row.dataset.id || "");
      if (action === "mark-absent") markPlayerAbsent(row.dataset.id || "");
      if (action === "show-condition") showCondition(row, actionElement.dataset.condition || "");
      if (action === "remove-condition") removeCondition(row, actionElement.dataset.condition || "");
      if (action === "close-condition-info") { const id = row.dataset.id || ""; focusedConditions.delete(id); renderTracker({ forceConditionId: id }); }
      if (action === "toggle-statblock") { const id = row.dataset.id || ""; if (expandedStatblocks.has(id)) expandedStatblocks.delete(id); else expandedStatblocks.add(id); renderTracker(); }
      if (action === "adjust-legendary") adjustLegendary(row, actionElement.dataset.kind || "", Number(actionElement.dataset.delta) || 0);
    });

    document.getElementById("addNpcBtn")?.addEventListener("click", openNpcPicker);
    document.getElementById("addCustomNpcBtn")?.addEventListener("click", addCustomNpc);
    document.getElementById("openCustomStatblockBtn")?.addEventListener("click", () => { clearCustomStatblockForm(); openCustomStatblockPanel(); });
    document.getElementById("closeCustomStatblockBtn")?.addEventListener("click", closeCustomStatblockPanel);
    document.getElementById("saveCustomStatblockBtn")?.addEventListener("click", () => saveCustomStatblock({ addToTracker: false }));
    document.getElementById("saveAddCustomStatblockBtn")?.addEventListener("click", () => saveCustomStatblock({ addToTracker: true }));
    document.getElementById("resetCustomStatblockBtn")?.addEventListener("click", clearCustomStatblockForm);
    const builderPanel = document.getElementById("customStatblockPanel");
    builderPanel?.addEventListener("input", handleBuilderInput);
    builderPanel?.addEventListener("change", handleBuilderInput);
    builderPanel?.addEventListener("click", handleBuilderClick);
    builderPanel?.addEventListener("keydown", handleBuilderKeydown);
    builderPanel?.addEventListener("paste", handleBuilderPaste);
    builderPanel?.addEventListener("focusout", event => { if (event.target.matches(".builder-save-input")) refreshBuilderDerived(); });
    document.getElementById("statblockImportInput")?.addEventListener("change", event => { importStatblockFile(event.target.files?.[0]); event.target.value = ""; });
    document.getElementById("closeNpcPickerBtn")?.addEventListener("click", closeNpcPicker);
    document.getElementById("npcPickerBackdrop")?.addEventListener("click", event => { if (event.target.id === "npcPickerBackdrop") closeNpcPicker(); });
    document.getElementById("statblockResults")?.addEventListener("click", event => {
      const addButton = event.target.closest('[data-action="add-statblock-npc"]');
      const previewButton = event.target.closest('[data-action="preview-statblock"]');
      const editButton = event.target.closest('[data-action="edit-statblock"]');
      if (addButton) addStatblockNpc(addButton.dataset.statblockId || "");
      if (previewButton) { selectedStatblockId = previewButton.dataset.statblockId || ""; renderStatblockResults(); }
      if (editButton) openStatblockEditor(editButton.dataset.statblockId || "");
    });
    document.getElementById("statblockPreview")?.addEventListener("click", event => {
      const addButton = event.target.closest('[data-action="add-previewed-statblock"]');
      const editButton = event.target.closest('[data-action="edit-statblock"]');
      if (addButton) addStatblockNpc(addButton.dataset.statblockId || selectedStatblockId);
      if (editButton) openStatblockEditor(editButton.dataset.statblockId || selectedStatblockId);
    });
    ["statblockSearchInput", "statblockSectionFilter", "statblockTypeFilter", "statblockSizeFilter", "statblockCrFilter"].forEach(id => document.getElementById(id)?.addEventListener(id === "statblockSearchInput" ? "input" : "change", renderStatblockResults));
    document.getElementById("clearStatblockFiltersBtn")?.addEventListener("click", clearStatblockFilters);
    document.getElementById("nextTurnBtn")?.addEventListener("click", advanceTurn);
    document.getElementById("previousTurnBtn")?.addEventListener("click", previousTurn);
    document.getElementById("rollNpcInitiativeBtn")?.addEventListener("click", rollAllNpcInitiative);
    const autoRoll = document.getElementById("autoRollNpcInitiative");
    if (autoRoll) {
      autoRoll.checked = state.autoRollNpcInitiative;
      autoRoll.addEventListener("change", () => { state.autoRollNpcInitiative = autoRoll.checked; persistTrackerState(); });
    }
    document.getElementById("absentPlayersBar")?.addEventListener("click", event => {
      const chip = event.target.closest("[data-restore-id]");
      if (chip) restorePlayer(chip.dataset.restoreId);
    });
    document.getElementById("resetCombatBtn")?.addEventListener("click", resetCombat);
    window.addEventListener("keydown", event => { if (event.key === "Escape") { closeCustomStatblockPanel(); closeNpcPicker(); } });

    syncChannel?.addEventListener("message", event => receiveLiveUpdate(event.data));
    window.addEventListener("storage", event => { if (event.key !== SYNC_STORAGE_KEY || !event.newValue) return; try { receiveLiveUpdate(JSON.parse(event.newValue)); } catch {} });

    try {
      await Promise.all([characterStorage.init(), loadStatblockLibrary()]);
      state.npcs = state.npcs.map(normalizeNpc);
      state.customStatblocks = Array.isArray(state.customStatblocks) ? state.customStatblocks.map(normalizeStatblock) : [];
      persistTrackerState();
      await refreshPlayers();
      startPolling();
    }
    catch (error) { console.error(error); alert(error.message || "Could not initialize the DM screen."); }
  });
})();
