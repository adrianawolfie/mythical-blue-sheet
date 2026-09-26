// Mythical Blue · Character rules
// Values derived from class, level, ability scores, and proficiencies (2024 Player's Handbook).

// Spell slots by caster level from the 2024 Player's Handbook class tables.
const FULL_CASTER_SPELL_SLOTS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1]
];
const PHB_CLASSES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"];

function applyClassSpellSlots() {
  const className = getFieldValue("class");
  if (!PHB_CLASSES.includes(className)) return;
  const level = Number.parseInt(getFieldValue("level"), 10) || 0;
  const subclass = getFieldValue("subclass");
  let casterLevel = 0;
  if (["Bard", "Cleric", "Druid", "Sorcerer", "Wizard"].includes(className)) casterLevel = level;
  if (["Paladin", "Ranger"].includes(className)) casterLevel = Math.ceil(level / 2);
  if ((className === "Fighter" && /eldritch knight/i.test(subclass)) || (className === "Rogue" && /arcane trickster/i.test(subclass))) {
    casterLevel = level >= 3 ? Math.ceil(level / 3) : 0;
  }
  const slots = FULL_CASTER_SPELL_SLOTS[casterLevel - 1] || [];
  for (let slotLevel = 1; slotLevel <= 9; slotLevel++) {
    setFieldValue(document.querySelector(`[data-field="spellSlotsMaxLevel${slotLevel}"]`), slots[slotLevel - 1] ? String(slots[slotLevel - 1]) : "");
  }

  const warlock = className === "Warlock" && level > 0;
  setFieldValue(document.querySelector('[data-field="pactSlotsMax"]'), warlock ? String(level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1) : "");
  setFieldValue(document.querySelector('[data-field="pactSlotLevel"]'), warlock ? String(Math.min(5, Math.ceil(level / 2))) : "1");
  renderSpellSlots();
}

const CLASS_HIT_DIE = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8,
  Druid: 8, Monk: 8, Rogue: 8, Warlock: 8, Sorcerer: 6, Wizard: 6
};
const CLASS_SAVING_THROWS = {
  Barbarian: ["strength", "constitution"], Bard: ["dexterity", "charisma"], Cleric: ["wisdom", "charisma"],
  Druid: ["intelligence", "wisdom"], Fighter: ["strength", "constitution"], Monk: ["strength", "dexterity"],
  Paladin: ["wisdom", "charisma"], Ranger: ["strength", "dexterity"], Rogue: ["dexterity", "intelligence"],
  Sorcerer: ["constitution", "charisma"], Warlock: ["wisdom", "charisma"], Wizard: ["intelligence", "wisdom"]
};
const CLASS_SPELLCASTING_ABILITY = {
  Bard: "CHA", Cleric: "WIS", Druid: "WIS", Paladin: "CHA", Ranger: "WIS", Sorcerer: "CHA", Warlock: "CHA", Wizard: "INT"
};
const ABILITY_SKILLS = {
  strength: ["athletics"],
  dexterity: ["acrobatics", "sleightOfHand", "stealth"],
  constitution: [],
  intelligence: ["arcana", "history", "investigation", "nature", "religion"],
  wisdom: ["animalHandling", "insight", "medicine", "perception", "survival"],
  charisma: ["deception", "intimidation", "performance", "persuasion"]
};
const ABILITY_ABBREVIATIONS = {
  STR: "strength", DEX: "dexterity", CON: "constitution", INT: "intelligence", WIS: "wisdom", CHA: "charisma"
};

function signedNumber(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function sameDerivedValue(a, b) {
  const normalize = value => String(value ?? "").trim().toLowerCase().replace(/^\+/, "").replace(/\s+/g, "");
  return normalize(a) === normalize(b);
}

function numberFieldValue(fieldKey) {
  const value = Number.parseInt(getFieldValue(fieldKey), 10);
  return Number.isFinite(value) ? value : null;
}

// Fills a calculated field (a data-field key or an input) unless the player typed their own value there.
// Custom values are kept (and marked) until the field is cleared.
function applyDerivedValue(fieldKey, value) {
  const field = typeof fieldKey === "string" ? document.querySelector(`.sheet [data-field="${fieldKey}"]`) : fieldKey;
  if (!field) return;
  const current = String(readFieldValue(field));
  const followsRules = current.trim() === "" ||
    (field.dataset.autoValue !== undefined && sameDerivedValue(current, field.dataset.autoValue));

  if (followsRules && document.activeElement !== field && !sameDerivedValue(current, value)) {
    setFieldValue(field, value);
    if (field.id === "hpMaxInput") {
      field.dataset.configuredValue = field.value;
      updateHPBar();
    }
  }

  field.dataset.autoValue = String(value);
  const shown = String(readFieldValue(field));
  field.classList.toggle("is-manual", field.type !== "checkbox" && value !== "" && shown.trim() !== "" && !sameDerivedValue(shown, value));
  if (field.classList.contains("is-manual")) {
    field.title = `Custom value. Clear it to use the calculated ${value}.`;
  } else {
    field.removeAttribute("title");
  }
}

function recalculateCharacterRules() {
  const className = getFieldValue("class");
  const level = Number.parseInt(getFieldValue("level"), 10) || 0;
  const subclass = getFieldValue("subclass");

  applyDerivedValue("proficiencyBonus", level ? signedNumber(2 + Math.floor((level - 1) / 4)) : "");
  const proficiencyBonus = numberFieldValue("proficiencyBonus") ?? 0;
  const featureNames = getFeatureEntries().map(entry => entry.querySelector(".feature-name")?.value.trim() || "");
  // Bards gain Jack of All Trades at level 2; other characters get it from a feature with that name.
  const jackOfAllTrades = (className === "Bard" && level >= 2) || featureNames.some(name => /^jack of all trades\b/i.test(name));

  Object.entries(ABILITY_SKILLS).forEach(([ability, skills]) => {
    const score = Number.parseInt(getFieldValue(`${ability}Score`), 10);
    applyDerivedValue(`${ability}Modifier`, Number.isFinite(score) ? signedNumber(Math.floor((score - 10) / 2)) : "");
    const modifier = numberFieldValue(`${ability}Modifier`);

    [`${ability}SavingThrow`, ...skills].forEach(key => {
      const dot = document.querySelector(`.sk [data-field="${key}"]`)?.parentElement.querySelector(".dot");
      const isSkill = !key.endsWith("SavingThrow");
      const bonus = dot?.classList.contains("expert") ? proficiencyBonus * 2
        : dot?.classList.contains("on") ? proficiencyBonus
        : isSkill && jackOfAllTrades ? Math.floor(proficiencyBonus / 2)
        : 0;
      applyDerivedValue(key, modifier === null ? "" : signedNumber(modifier + bonus));
    });
  });

  const perception = numberFieldValue("perception");
  applyDerivedValue("passivePerception", perception === null ? "" : String(10 + perception));

  const dexterity = numberFieldValue("dexterityModifier");
  // Alert and Reactive (Pragmatic Survivor) add proficiency bonus to Initiative.
  const addsProficiencyToInitiative = featureNames.some(name => /^(alert|reactive)\b/i.test(name));
  applyDerivedValue("initiative", dexterity === null ? "" : signedNumber(dexterity + (addsProficiencyToInitiative ? proficiencyBonus : 0)));

  const thirdCaster = (className === "Fighter" && /eldritch knight/i.test(subclass)) ||
    (className === "Rogue" && /arcane trickster/i.test(subclass));
  if (PHB_CLASSES.includes(className)) {
    applyDerivedValue("spellcastingAbility", CLASS_SPELLCASTING_ABILITY[className] || (thirdCaster ? "INT" : ""));
  }
  const spellAbility = ABILITY_ABBREVIATIONS[String(getFieldValue("spellcastingAbility")).trim().slice(0, 3).toUpperCase()];
  const spellModifier = spellAbility ? numberFieldValue(`${spellAbility}Modifier`) : null;
  applyDerivedValue("spellSaveDc", spellModifier === null ? "" : String(8 + proficiencyBonus + spellModifier));
  applyDerivedValue("spellAttackBonus", spellModifier === null ? "" : signedNumber(proficiencyBonus + spellModifier));

  const hitDie = CLASS_HIT_DIE[className];
  const constitution = numberFieldValue("constitutionModifier");
  applyDerivedValue("hitDice", level && hitDie ? `${level}d${hitDie}` : "");
  applyDerivedValue("hpMax", level && hitDie && constitution !== null
    ? String(Math.max(1, hitDie + constitution + (level - 1) * (hitDie / 2 + 1 + constitution)))
    : "");
  renderFeatureResources();
  if (typeof recalculateAttacks === "function") recalculateAttacks();
}

// Called after a character loads so previous characters' calculated values are forgotten.
function resetCharacterRules() {
  document.querySelectorAll(".sheet [data-auto-value]").forEach(field => delete field.dataset.autoValue);
  recalculateCharacterRules();
}

function cycleSkillProficiency(dot) {
  if (dot.classList.contains("expert")) {
    dot.classList.remove("on", "expert");
  } else if (dot.classList.contains("on")) {
    dot.classList.add("expert");
  } else {
    dot.classList.add("on");
  }
}

document.addEventListener("click", event => {
  if (!event.target.closest(".sk .dot")) return;
  recalculateCharacterRules();
  markCharacterDirty();
});

document.addEventListener("input", event => {
  if (event.target.closest(".sheet")) recalculateCharacterRules();
});

document.addEventListener("change", event => {
  if (!event.target.closest(".sheet")) return;
  if (event.target.matches('[data-field="class"]')) {
    const saves = CLASS_SAVING_THROWS[getFieldValue("class")];
    document.querySelectorAll('.sk [data-field$="SavingThrow"]').forEach(input => {
      if (saves) input.parentElement.querySelector(".dot").classList.toggle("on", saves.some(ability => input.dataset.field === `${ability}SavingThrow`));
    });
  }
  if (event.target.matches('[data-field="class"], [data-field="level"], [data-field="subclass"]')) applyClassSpellSlots();
  recalculateCharacterRules();
});
