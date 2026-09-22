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
    const fallback = { round: 1, activeId: "", playerInitiatives: {}, playerConcentration: {}, npcs: [], customStatblocks: [] };
    try {
      const parsed = JSON.parse(localStorage.getItem(DM_STATE_KEY) || "{}");
      return {
        round: Math.max(1, Number(parsed.round) || 1),
        activeId: String(parsed.activeId || ""),
        playerInitiatives: parsed.playerInitiatives && typeof parsed.playerInitiatives === "object" ? parsed.playerInitiatives : {},
        playerConcentration: parsed.playerConcentration && typeof parsed.playerConcentration === "object" ? parsed.playerConcentration : {},
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

  const STATBLOCK_SECTION_HEADINGS = ["Traits", "Actions", "Bonus Actions", "Reactions", "Legendary Actions"];
  const STATBLOCK_META_PREFIXES = ["Skills", "Gear", "Senses", "Languages", "CR", "Resistances", "Immunities", "Vulnerabilities"];

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

    const connectors = new Set(["a", "an", "and", "at", "by", "for", "from", "if", "in", "of", "on", "only", "or", "the", "to", "with", "while"]);
    return words.every((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && connectors.has(lower)) return true;
      return /^[A-Z0-9]/.test(word);
    });
  }

  function splitStatblockEntries(lines) {
    const rawText = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
    const sourceLines = expandInlineStatblockEntryBreaks(rawText).split(/\r?\n/);
    const entries = [];
    let current = null;

    sourceLines.map(normalizeStatblockLine).filter(Boolean).forEach(line => {
      const titleMatch = line.match(/^([^.!?]{1,92})\.\s*(.*)$/);
      if (titleMatch && looksLikeStatblockEntryTitle(titleMatch[1])) {
        current = { title: titleMatch[1].trim(), text: titleMatch[2].trim() };
        entries.push(current);
        return;
      }

      if (!current) {
        current = { title: "", text: line };
        entries.push(current);
        return;
      }

      current.text = `${current.text} ${line}`.trim();
    });

    return entries.filter(entry => entry.title || entry.text);
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

    return { abilities, metadata, sections: sections.map(section => ({ title: section.title, entries: splitStatblockEntries(section.lines) })) };
  }

  function createStatblockPanel(statblock, { closeButton = false, addButton = false, editButton = false } = {}) {
    if (!statblock) return null;
    const structured = parseStructuredStatblock(statblock);
    const panel = document.createElement("section");
    panel.className = "inline-statblock";
    panel.setAttribute("aria-label", `${statblock.name} statblock`);
    const header = document.createElement("header");
    header.className = "inline-statblock-header";
    const heading = document.createElement("div");
    const source = document.createElement("div");
    source.className = "dm-section-label";
    source.textContent = statblock.source || statblock.section || "Statblock";
    const title = document.createElement("h3");
    title.textContent = statblock.name;
    const subtitle = document.createElement("p");
    subtitle.textContent = `${statblock.size} ${statblock.type}, ${statblock.alignment}`;
    heading.append(source, title, subtitle);
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

    const vitals = document.createElement("div");
    vitals.className = "inline-statblock-vitals";
    [["Armor Class", statblock.armorClass || "—"], ["Hit Points", statblock.hp || "—", statblock.hpFormula ? `(${statblock.hpFormula})` : ""], ["Initiative", statblock.initiative || "—"], ["Speed", statblock.speed || "—"], ["Challenge", statblock.challengeRating ? `CR ${statblock.challengeRating}` : "—"], ["Proficiency", getProficiencyBonus(statblock) ? `PB +${getProficiencyBonus(statblock)}` : "—"]].forEach(([label, value, detail]) => {
      const vital = document.createElement("div");
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const valueElement = document.createElement("strong");
      valueElement.textContent = value;
      vital.append(labelElement, valueElement);
      if (detail) {
        const detailElement = document.createElement("small");
        detailElement.textContent = detail;
        vital.append(detailElement);
      }
      vitals.append(vital);
    });
    panel.append(vitals);

    if (statblock.description) {
      const description = document.createElement("p");
      description.className = "inline-statblock-description";
      description.textContent = statblock.description;
      panel.append(description);
    }
    if (structured.abilities.length) {
      const abilities = document.createElement("div");
      abilities.className = "inline-statblock-abilities";
      structured.abilities.forEach(ability => {
        const item = document.createElement("div");
        item.className = "inline-statblock-ability";
        const heading = document.createElement("div");
        heading.className = "inline-statblock-ability-heading";
        const name = document.createElement("strong");
        name.textContent = ability.name;
        const score = document.createElement("span");
        score.textContent = ability.score;
        heading.append(name, score);
        const values = document.createElement("div");
        values.className = "inline-statblock-ability-values";
        [["Mod", ability.modifier, "small"], ["Save", ability.save, "em"]].forEach(([label, value, tag]) => {
          const valueWrap = document.createElement(tag);
          const valueLabel = document.createElement("b");
          valueLabel.textContent = label;
          const number = document.createElement("span");
          number.textContent = value;
          valueWrap.append(valueLabel, number);
          values.append(valueWrap);
        });
        item.append(heading, values);
        abilities.append(item);
      });
      panel.append(abilities);
    }
    if (structured.metadata.length) {
      const metadata = document.createElement("dl");
      metadata.className = "inline-statblock-metadata";
      structured.metadata.forEach(item => {
        const row = document.createElement("div");
        const label = document.createElement("dt");
        label.textContent = item.label;
        const value = document.createElement("dd");
        value.textContent = item.value || "—";
        row.append(label, value);
        metadata.append(row);
      });
      panel.append(metadata);
    }
    if (structured.sections.length) {
      const sections = document.createElement("div");
      sections.className = "inline-statblock-sections";
      structured.sections.forEach(section => {
        const sectionElement = document.createElement("section");
        sectionElement.className = "inline-statblock-section";
        const heading = document.createElement("h4");
        heading.textContent = section.title;
        sectionElement.append(heading);
        section.entries.forEach(entry => {
          const article = document.createElement("article");
          article.className = "inline-statblock-entry";
          if (entry.title) {
            const title = document.createElement("h5");
            title.textContent = entry.title;
            article.append(title);
          }
          const text = document.createElement("p");
          text.textContent = entry.text;
          article.append(text);
          sectionElement.append(article);
        });
        sections.append(sectionElement);
      });
      panel.append(sections);
    }
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
    concentration.title = "Concentrating";
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
      const lock = document.createElement("span");
      lock.className = "player-lock-icon";
      lock.title = "Character live sync";
      lock.setAttribute("aria-label", "Character live sync");
      lock.textContent = "◆";
      row.append(lock);
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
    activeText.textContent = active ? `Current turn · ${active.name}` : "Add initiative values to begin.";
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
    const combatants = getCombatants();
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
    state.npcs.push(normalizeNpc({ id: createId(), name: "New NPC" }));
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

  function resetCombat() {
    if (!confirm("Reset initiative values, NPCs, concentration markers, active turn, and round number? Custom statblocks stay saved.")) return;
    state = { ...state, round: 1, activeId: "", playerInitiatives: {}, playerConcentration: {}, npcs: [] };
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
      .replace(/[\u0300-\u036f]/g, "");
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
    const title = document.getElementById("customStatblockTitle");
    if (title) title.textContent = "Create Custom Statblock";
    const saveButton = document.getElementById("saveCustomStatblockBtn");
    if (saveButton) saveButton.textContent = "Save Statblock";
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

  function statblockEntriesToText(section, { skipLegendaryUses = false, skipLegendaryResistance = false } = {}) {
    if (!section) return "";
    return section.entries
      .filter(entry => {
        const combined = `${entry.title || ""} ${entry.text || ""}`.trim();
        if (skipLegendaryUses && /^Legendary Action Uses\b/i.test(combined)) return false;
        if (skipLegendaryResistance && /^Legendary Resistance\b/i.test(combined)) return false;
        return Boolean(combined);
      })
      .map(entry => entry.title ? `${entry.title}. ${entry.text || ""}`.trim() : String(entry.text || "").trim())
      .join("\n");
  }

  function openStatblockEditor(statblockId) {
    const statblock = getStatblockById(statblockId);
    if (!statblock) return;
    const isCustom = isCustomStatblock(statblock);
    editingStatblockId = isCustom ? statblock.id : "";
    const structured = parseStructuredStatblock(statblock);
    const abilityMap = new Map(structured.abilities.map(ability => [ability.name.toLowerCase(), ability.score]));
    const sectionByTitle = new Map(structured.sections.map(section => [section.title, section]));
    const proficiencyBonus = getProficiencyBonus(statblock);
    const inferredSkills = inferSkillsFromMetadata(structured.metadata, structured.abilities, proficiencyBonus);
    const inferredSaves = inferSaveProficiencies(structured.abilities, proficiencyBonus);
    const meta = structured.metadata
      .filter(item => item.label !== "CR" && item.label !== "Skills")
      .map(item => `${item.label} ${item.value || ""}`.trim())
      .join("\n");

    setCustomField("customStatName", statblock.name);
    setCustomField("customStatSize", statblock.size);
    setCustomField("customStatType", statblock.type);
    setCustomField("customStatAlignment", statblock.alignment);
    setCustomField("customStatDescription", statblock.description || "");
    setCustomField("customStatAc", statblock.armorClass);
    setCustomField("customStatHp", statblock.hp);
    setCustomField("customStatHpFormula", statblock.hpFormula);
    setCustomField("customStatInitiative", statblock.initiative);
    setCustomField("customStatSpeed", statblock.speed);
    setCustomField("customStatCr", statblock.challengeRating);
    setCustomField("customStatPb", proficiencyBonus);
    setCustomField("customStatLegendaryResistance", getLegendaryResistanceMax(statblock));
    setCustomField("customStatLegendaryActions", getLegendaryActionMax(statblock));
    setCustomField("customStatStr", abilityMap.get("str") || "10");
    setCustomField("customStatDex", abilityMap.get("dex") || "10");
    setCustomField("customStatCon", abilityMap.get("con") || "10");
    setCustomField("customStatInt", abilityMap.get("int") || "10");
    setCustomField("customStatWis", abilityMap.get("wis") || "10");
    setCustomField("customStatCha", abilityMap.get("cha") || "10");
    setCheckedValues("customSaveProficiency", statblock.saveProficiencies?.length ? statblock.saveProficiencies : inferredSaves);
    setCustomField("customStatSkillProficiencies", (statblock.skillProficiencies?.length ? statblock.skillProficiencies : inferredSkills.proficient).join(", "));
    setCustomField("customStatSkillExpertise", (statblock.skillExpertise?.length ? statblock.skillExpertise : inferredSkills.expert).join(", "));
    setCustomField("customStatMeta", meta);
    setCustomField("customStatTraits", statblockEntriesToText(sectionByTitle.get("Traits"), { skipLegendaryResistance: true }));
    setCustomField("customStatActions", statblockEntriesToText(sectionByTitle.get("Actions")));
    setCustomField("customStatExtraActions", [
      sectionByTitle.has("Bonus Actions") ? `Bonus Actions\n${statblockEntriesToText(sectionByTitle.get("Bonus Actions"))}` : "",
      sectionByTitle.has("Reactions") ? `Reactions\n${statblockEntriesToText(sectionByTitle.get("Reactions"))}` : ""
    ].filter(Boolean).join("\n"));
    setCustomField("customStatLegendaryText", statblockEntriesToText(sectionByTitle.get("Legendary Actions"), { skipLegendaryUses: true }));

    const title = document.getElementById("customStatblockTitle");
    const saveButton = document.getElementById("saveCustomStatblockBtn");
    if (title) title.textContent = isCustom ? `Edit ${statblock.name}` : `Edit ${statblock.name} as Custom`;
    if (saveButton) saveButton.textContent = isCustom ? "Save Changes" : "Save Custom Copy";
    openCustomStatblockPanel();
  }

  function buildCustomStatblockFromForm() {
    const name = getFieldValue("customStatName") || "Custom Monster";
    const size = getFieldValue("customStatSize") || "Medium";
    const type = getFieldValue("customStatType") || "Creature";
    const alignment = getFieldValue("customStatAlignment") || "Unaligned";
    const description = getTextareaValue("customStatDescription");
    const armorClass = getFieldValue("customStatAc") || "10";
    const hp = getFieldValue("customStatHp") || "1";
    const hpFormula = getFieldValue("customStatHpFormula");
    const initiative = getFieldValue("customStatInitiative");
    const speed = getFieldValue("customStatSpeed") || "30 ft.";
    const challengeRating = getFieldValue("customStatCr") || "0";
    const proficiencyBonus = toNumber(getFieldValue("customStatPb"), challengeToProficiencyBonus(challengeRating));
    const saveProficiencies = selectedCheckboxValues("customSaveProficiency");
    const skillProficiencies = parseCommaList(getFieldValue("customStatSkillProficiencies"));
    const skillExpertise = parseCommaList(getFieldValue("customStatSkillExpertise"));
    const lr = toNumber(getFieldValue("customStatLegendaryResistance"), 0);
    const la = toNumber(getFieldValue("customStatLegendaryActions"), 0);
    const abilities = [
      ["Str", getFieldValue("customStatStr") || "10"],
      ["Dex", getFieldValue("customStatDex") || "10"],
      ["Con", getFieldValue("customStatCon") || "10"],
      ["Int", getFieldValue("customStatInt") || "10"],
      ["Wis", getFieldValue("customStatWis") || "10"],
      ["Cha", getFieldValue("customStatCha") || "10"]
    ];
    const abilityScores = abilityScoreMapFromPairs(abilities);
    const saveSet = new Set(saveProficiencies.map(item => item.toLowerCase()));
    const abilityLines = abilities.map(([label, score]) => {
      const modifier = abilityModifierNumber(score);
      const save = modifier + (saveSet.has(label.toLowerCase()) ? proficiencyBonus : 0);
      return `${label} ${score} ${formatBonus(modifier)} ${formatBonus(save)}`;
    }).join("\n");
    const generatedSkills = buildSkillsLine(skillProficiencies, skillExpertise, abilityScores, proficiencyBonus);
    const meta = [generatedSkills, getTextareaValue("customStatMeta")].filter(Boolean).join("\n");
    const traits = getTextareaValue("customStatTraits");
    const actions = getTextareaValue("customStatActions");
    const extra = getTextareaValue("customStatExtraActions");
    const legendaryText = getTextareaValue("customStatLegendaryText");
    const legendaryResistanceText = lr ? `Legendary Resistance (${lr}/Day). If the monster fails a saving throw, it can choose to succeed instead.` : "";
    const legendaryHeader = la ? `Legendary Action Uses: ${la}. Immediately after another creature’s turn, the monster can expend a use to take one of the following actions. The monster regains all expended uses at the start of each of its turns.` : "";
    const sections = [
      `${name}\n${size} ${type}, ${alignment}\nAC ${armorClass}\n${initiative ? `Initiative ${initiative}\n` : ""}HP ${hp}${hpFormula ? ` (${hpFormula})` : ""}\nSpeed ${speed}\nMOD SAVE\n${abilityLines}\n${meta}\nCR ${challengeRating} (PB ${formatBonus(proficiencyBonus)})`,
      [legendaryResistanceText, traits].filter(Boolean).length ? `Traits\n${[legendaryResistanceText, traits].filter(Boolean).join("\n")}` : "",
      actions ? `Actions\n${actions}` : "",
      extra,
      la || legendaryText ? `Legendary Actions\n${[legendaryHeader, legendaryText].filter(Boolean).join("\n")}` : ""
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
