// Mythical Blue · Core character data
// Shared state, schema migration, loading, saving, and navigation.

function sw(name, btn) {
    document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
    document.getElementById('pg-' + name).classList.add('on');
    btn.classList.add('on');
  }

let currentCharacterId = null;
let currentCharacterCampaignId = "";
let loadedCharacterUpdatedAt = null;
let loadedCharacterLiveUpdatedAt = null;
let characterHasUnsavedChanges = false;

const STORAGE_KEY = "mythicalBlueCharacters";
const CURRENT_SCHEMA_VERSION = 2;

// Legacy positional mapping used only to read old schema-v1 characters.
// New saves use stable data-field names so layout changes cannot shift values.
const LEGACY_FIELD_KEYS = [
  "characterName",
  "background",
  "classLevel",
  "experience",
  "speciesRace",
  "subclass",
  "alignment",
  "initiative",
  "speed",
  "armorClass",
  "hpCurrent",
  "hpMax",
  "tempHp",
  "currentConditions",
  "proficiencyBonus",
  "passivePerception",
  "strengthModifier",
  "strengthScore",
  "strengthSavingThrow",
  "athletics",
  "dexterityModifier",
  "dexterityScore",
  "dexteritySavingThrow",
  "acrobatics",
  "sleightOfHand",
  "stealth",
  "constitutionModifier",
  "constitutionScore",
  "constitutionSavingThrow",
  "intelligenceModifier",
  "intelligenceScore",
  "intelligenceSavingThrow",
  "arcana",
  "history",
  "investigation",
  "nature",
  "religion",
  "wisdomModifier",
  "wisdomScore",
  "wisdomSavingThrow",
  "animalHandling",
  "insight",
  "medicine",
  "perception",
  "survival",
  "charismaModifier",
  "charismaScore",
  "charismaSavingThrow",
  "deception",
  "intimidation",
  "performance",
  "persuasion",
  "equipmentProficiencies",
  "hitDice",
  "hitDiceSpent",
  "copperPieces",
  "silverPieces",
  "electrumPieces",
  "goldPieces",
  "platinumPieces",
  "treasureNotes",
  "spellcastingAbility",
  "spellSaveDc",
  "spellAttackBonus",
  "spellSlotsLevel1",
  "spellSlotsLevel2",
  "spellSlotsLevel3",
  "spellSlotsLevel4",
  "spellSlotsLevel5",
  "spellSlotsLevel6",
  "spellSlotsLevel7",
  "spellSlotsLevel8",
  "spellSlotsLevel9",
  "backstory",
  "personalityIdealsBonds",
  "appearance",
  "languages",
  "attunement",
  "equipmentInventory"
];

function getCharacters() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveCharacters(characters) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
}

function isCharacterSheetVisible() {
  const sheet = document.querySelector(".sheet");
  return Boolean(currentCharacterId && sheet && sheet.style.display !== "none");
}

function markCharacterDirty() {
  if (!isCharacterSheetVisible()) return;
  characterHasUnsavedChanges = true;
}

function markCharacterClean() {
  characterHasUnsavedChanges = false;
}

function hasUnsavedCharacterChanges() {
  return isCharacterSheetVisible() && characterHasUnsavedChanges === true;
}

function confirmDiscardUnsavedCharacterChanges(actionText = "leave this character") {
  if (!hasUnsavedCharacterChanges()) return true;
  return confirm(`You have unsaved character changes. Do you want to ${actionText} without saving?`);
}

function getFields() {
  return Array.from(document.querySelectorAll(".sheet [data-field]"));
}

function readFieldValue(field) {
  return field.type === "checkbox" ? field.checked : field.value;
}

function setFieldValue(field, value) {
  if (!field) return;

  if (field.type === "checkbox") {
    field.checked = value === true;
    return;
  }

  field.value = typeof value === "boolean" ? "" : (value ?? "");
}

function collectNamedFields() {
  const namedFields = Object.fromEntries(
    getFields().map(field => [field.dataset.field, readFieldValue(field)])
  );

  [
    "equipmentProficiencies",
    "armorProficiencies",
    "weaponProficiencies",
    "toolProficiencies",
    "otherProficiencies",
    "classLevel",
    "classSubclass",
    "experience"
  ].forEach(key => delete namedFields[key]);

  [
    "armorClass",
    "hpCurrent",
    "tempHp",
    "currentConditions",
    "hitDiceSpent"
  ].forEach(key => delete namedFields[key]);

  const hpMaxInput = document.getElementById("hpMaxInput");
  if (hpMaxInput?.dataset.configuredValue !== undefined) {
    namedFields.hpMax = hpMaxInput.dataset.configuredValue;
  }

  return namedFields;
}

function normalizeSavedFields(character = {}) {
  const savedFields = character.fields || {};

  if (
    character.schemaVersion >= CURRENT_SCHEMA_VERSION &&
    savedFields &&
    !Array.isArray(savedFields)
  ) {
    return savedFields;
  }

  // Temporary backwards-compatible reader for schema-v1 positional saves.
  if (Array.isArray(savedFields)) {
    return Object.fromEntries(
      savedFields
        .map(item => [LEGACY_FIELD_KEYS[item.index], item.value])
        .filter(([key]) => Boolean(key))
    );
  }

  return {};
}

function migrateLegacyEquipmentAndProficiencies(namedFields = {}) {
  const migrated = { ...namedFields };
  const legacyText = String(migrated.equipmentProficiencies || "").trim();

  const newKeys = [
    "armorProficiencies",
    "weaponProficiencies",
    "toolProficiencies",
    "otherProficiencies",
    "equipment"
  ];

  const alreadyMigrated = newKeys.some(key =>
    String(migrated[key] || "").trim()
  );

  if (legacyText && !alreadyMigrated) {
    const otherLines = [];

    legacyText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .forEach(line => {
        const match = line.match(/^([^:]+):\s*(.*)$/);
        const label = match ? match[1].trim().toLowerCase() : "";
        const value = match ? match[2].trim() : line;

        if (/^armou?r$/.test(label)) {
          migrated.armorProficiencies = value;
        } else if (/^weapons?$/.test(label)) {
          migrated.weaponProficiencies = value;
        } else if (/^tools?$/.test(label)) {
          migrated.toolProficiencies = value;
        } else if (/^equipment$/.test(label)) {
          migrated.equipment = value;
        } else {
          otherLines.push(line);
        }
      });

    if (otherLines.length) {
      migrated.otherProficiencies = otherLines.join(" · ");
    }
  }

  delete migrated.equipmentProficiencies;
  return migrated;
}

function migrateLegacyClassFields(namedFields = {}) {
  const migrated = { ...namedFields };

  const finalClass = String(migrated.class || "").trim();
  const finalSubclass = String(migrated.subclass || "").trim();
  const finalLevel = String(migrated.level || "").trim();

  let className = finalClass;
  let subclassName = finalSubclass;
  let parsedLevel = finalLevel;

  // Read the intermediate test format: "Class · Subclass".
  const combinedClassSubclass = String(migrated.classSubclass || "").trim();

  if (combinedClassSubclass && (!className || !subclassName)) {
    const combinedParts = combinedClassSubclass
      .split(/\s*[·|]\s*/)
      .map(value => value.trim())
      .filter(Boolean);

    if (!className && combinedParts.length) {
      className = combinedParts.shift();
    }

    if (!subclassName && combinedParts.length) {
      subclassName = combinedParts.join(" · ");
    }
  }

  // Read the original format: e.g. "Fighter 5" plus a separate subclass.
  const legacyClassLevel = String(migrated.classLevel || "").trim();

  if (legacyClassLevel) {
    let parsedClass = legacyClassLevel;

    const levelMatch = legacyClassLevel.match(
      /^(.*?)(?:\s+|\s*[-–—|·]\s*)(\d{1,2})$/
    );

    if (levelMatch) {
      parsedClass = levelMatch[1].trim();

      if (!parsedLevel) {
        parsedLevel = levelMatch[2];
      }
    }

    if (!className && parsedClass) {
      className = parsedClass;
    }
  }

  migrated.class = className;
  migrated.subclass = subclassName;
  migrated.level = parsedLevel;

  delete migrated.classLevel;
  delete migrated.classSubclass;
  delete migrated.experience;

  return migrated;
}

function applyNamedFields(namedFields = {}) {
  getFields().forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(namedFields, field.dataset.field)) return;
    setFieldValue(field, namedFields[field.dataset.field]);
  });
}

function getFieldValue(fieldKey) {
  const field = document.querySelector(`[data-field="${fieldKey}"]`);
  return field ? readFieldValue(field) : "";
}

function findFieldByNearbyText(possibleTexts) {
  const fields = getFields();

  for (const field of fields) {
    const container = field.closest("label, div, section, article") || field.parentElement;
    const text = container ? container.innerText.toLowerCase() : "";

    if (possibleTexts.some(t => text.includes(t.toLowerCase()))) {
      return field.value;
    }
  }

  return "";
}
 function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getValueByExactLabel(labelText) {
  const labels = Array.from(document.querySelectorAll(".sheet label"));

  const label = labels.find(l =>
    l.textContent.trim().toLowerCase() === labelText.toLowerCase()
  );

  if (!label) return "";

  const container = label.parentElement;
  const field = container.querySelector("input, textarea, select");

  return field ? field.value : "";
}
function getToggleStates(selector) {
  return Array.from(document.querySelectorAll(selector)).map(element =>
    element.classList.contains("on")
  );
}

function applyToggleStates(selector, savedStates = []) {
  document.querySelectorAll(selector).forEach((element, index) => {
    element.classList.toggle("on", savedStates[index] === true);
  });
}

function collectUiState() {
  return {
    skillProficiencies: getToggleStates(".sk .dot")
  };
}

function applyUiState(uiState = {}) {
  applyToggleStates(".sk .dot", uiState.skillProficiencies || []);
}

function showSaveToast(message) {
  if (typeof window.showToast === "function") {
    window.showToast(message, { variant: "success" });
  }
}

function collectCharacterData() {
  const fields = collectNamedFields();
  const isNewCharacter = loadedCharacterUpdatedAt === null;
  const initialLive = isNewCharacter ? {
    hpCurrent: document.getElementById("hpCurrentInput")?.value ?? "",
    hpOverride: null,
    tempHp: document.getElementById("tempHpInput")?.value ?? "",
    conditions: typeof getSelectedConditions === "function" ? getSelectedConditions() : [],
    inspiration: document.querySelector(".insp")?.textContent.trim() === "✦",
    exhaustionLevel: document.querySelectorAll(".exhaustion-row .svdie.on").length,
    deathSaves: {
      successes: document.querySelectorAll(".dsbox .svdie:not(.fail).on").length,
      failures: document.querySelectorAll(".dsbox .svdie.fail.on").length
    },
    hitDiceSpent: typeof collectHitDiceSpent === "function" ? collectHitDiceSpent() : {},
    activeArmorClassModifiers: typeof collectActiveArmorClassModifiers === "function"
      ? collectActiveArmorClassModifiers()
      : []
  } : undefined;

return {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: currentCharacterId || crypto.randomUUID(),
  campaignId: currentCharacterCampaignId || "",
  expectedUpdatedAt: loadedCharacterUpdatedAt,
  updatedAt: new Date().toISOString(),
  live: initialLive,
summary: {
  name: getFieldValue("characterName") || "Unnamed Character",
  armorClass: getFieldValue("armorClass"),
  hpMax: fields.hpMax ?? getFieldValue("hpMax"),
  hitDice: getFieldValue("hitDice"),
  passivePerception: getFieldValue("passivePerception")
},
    fields,
    uiState: collectUiState(),
customLists: {
  feats: collectFeatureEntries("featList"),
  weapons: collectWeaponRows(),
  spells: collectSpellRows(),
  proficiencies: collectProficiencyRows(),
  defenses: collectDefenseRows(),
  journalNotes: collectJournalNotes(),
  inventoryItems: collectUnifiedInventoryRows(),
  inventoryEquipment: collectInventoryEquipmentRows(),
  magicItems: collectInventoryMagicItemRows(),
  consumables: collectInventoryConsumableRows(),
  gems: collectInventoryGemRows(),
  attunementSlots: collectInventoryAttunementRows(),
  storageLocations: collectStorageLocations(),
  equippedSlots: collectEquippedSlots(),
  customEquippedSlots: collectCustomEquippedSlots(),
  inventoryView: getInventoryView(),
  speeds: collectExtraSpeedRows(),
  armorClass: (() => {
    const state = collectArmorClassState();
    return {
      ...state,
      modifiers: state.modifiers.map(({ active, ...modifier }) => modifier)
    };
  })()
}
  };
}

function loadCharacter(character) {
  currentCharacterId = character.id;
  currentCharacterCampaignId = character.campaignId || "";
  loadedCharacterUpdatedAt = character.updatedAt || null;
  loadedCharacterLiveUpdatedAt = character.live?.updatedAt || null;

  const normalizedFields = migrateLegacyClassFields(
    migrateLegacyEquipmentAndProficiencies(
      normalizeSavedFields(character)
    )
  );

  applyNamedFields(normalizedFields);
  syncCoinageMirrorsFromCanonical();

renderFeatureEntries("featList", character.customLists?.feats || []);
resetWeaponRows(character.customLists?.weapons || DEFAULT_WEAPON_ROWS);
resetSpellRows(character.customLists?.spells || DEFAULT_SPELL_ROWS);
resetJournalNotes(character.customLists?.journalNotes || []);
resetInventoryRows({
  inventoryItems: character.customLists?.inventoryItems || [],
  equipment: character.customLists?.inventoryEquipment || [],
  magicItems: character.customLists?.magicItems || [],
  consumables: character.customLists?.consumables || [],
  gems: character.customLists?.gems || [],
  attunement:
    character.customLists?.attunementSlots ||
    DEFAULT_INVENTORY_ATTUNEMENT_ROWS,
  storageLocations: character.customLists?.storageLocations || [],
  equippedSlots: character.customLists?.equippedSlots || {},
  customEquippedSlots: character.customLists?.customEquippedSlots || [],
  inventoryView: character.customLists?.inventoryView || "list"
});
renderExtraSpeedRows(character.customLists?.speeds || []);
renderArmorClassState(
  character.customLists?.armorClass || null,
  normalizedFields.armorClass ?? character.summary?.armorClass ?? "",
  { activeArmorClassModifiers: character.live?.activeArmorClassModifiers }
);
renderProficiencyRows(
  character.customLists?.proficiencies ||
  proficienciesFromNamedFields(normalizedFields)
);
renderDefenseRows(character.customLists?.defenses || {});
applyUiState(character.uiState || {});
applyLiveState(character.live || {});
focusedCondition = "";
renderSelectedConditions();

// Apply live HP while retaining configured max HP separately for full saves.
const hpCurrentInput = document.getElementById("hpCurrentInput");
const hpMaxInput = document.getElementById("hpMaxInput");

if (hpCurrentInput && character.live?.hpCurrent !== undefined) {
  hpCurrentInput.value = character.live.hpCurrent ?? "";
}

if (hpMaxInput) {
  const configuredHpMax = normalizedFields.hpMax ?? character.summary?.hpMax ?? "";
  hpMaxInput.dataset.configuredValue = configuredHpMax;
  hpMaxInput.value = character.live?.hpMax ?? configuredHpMax;
}

// Load Temp HP and Hit Dice by ID so they survive DOM reordering
const tempHpInput = document.getElementById("tempHpInput");
const hitDiceInput = document.getElementById("hitDiceInput");
if (tempHpInput && character.live?.tempHp !== undefined) {
  tempHpInput.value = character.live.tempHp ?? "";
}
if (hitDiceInput && character.summary?.hitDice !== undefined) {
  hitDiceInput.value = character.summary.hitDice || "";
}

updateHPBar(); // sync bar with loaded values

showSheet();
markCharacterClean();
}

async function saveCurrentCharacter(showAlert = true) {
  try {
    if (typeof flushCharacterLiveSave === "function") {
      await flushCharacterLiveSave(currentCharacterId);
    }
    const data = collectCharacterData();
    const result = await characterStorage.saveCharacterData(data);
    if (typeof flushCharacterLiveSave === "function") {
      await flushCharacterLiveSave(currentCharacterId);
    }

    currentCharacterId = data.id;
    loadedCharacterUpdatedAt = result.updatedAt || data.updatedAt;
    loadedCharacterLiveUpdatedAt = result.live?.updatedAt || loadedCharacterLiveUpdatedAt;
    const url = new URL(window.location.href);
    const detailPage = document.body.classList.contains("character-detail-page");
    const savedVersionPreview = detailPage && url.searchParams.has("version");
    markCharacterClean();
    if (detailPage) {
      url.searchParams.delete("version");
      url.searchParams.set("saved", savedVersionPreview ? "restored" : "character");
      window.location.assign(`${url.pathname}${url.search}${url.hash}`);
      return;
    }

    if (showAlert) {
      showSaveToast("Character saved!");
    }

    await renderCharacterList();
  } catch (error) {
    console.error(error);
    alert(error.message || "Error saving character.");
  }
}
function newCharacter() {
  currentCharacterId = crypto.randomUUID();
  currentCharacterCampaignId = "";
  loadedCharacterUpdatedAt = null;
  loadedCharacterLiveUpdatedAt = null;

  getFields().forEach(field => {
    if (field.type === "checkbox") {
      field.checked = false;
    } else {
      field.value = "";
    }
  });
  const hpMaxInput = document.getElementById("hpMaxInput");
  if (hpMaxInput) delete hpMaxInput.dataset.configuredValue;
  if (typeof applyLiveState === "function") applyLiveState({});

renderFeatureEntries("featList", []);
resetWeaponRows();
resetSpellRows();
resetJournalNotes();
resetInventoryRows();
renderExtraSpeedRows();
renderArmorClassState();
renderProficiencyRows();
renderDefenseRows();
applyUiState({});
focusedCondition = "";
renderSelectedConditions();

showSheet();
markCharacterClean();
}

async function deleteCurrentCharacter() {
  if (!currentCharacterId) return;
  if (!confirmDiscardUnsavedCharacterChanges("delete this character")) return;
  if (!confirm("Delete this character?")) return;

  try {
    await characterStorage.deleteCharacterData({
      id: currentCharacterId,
      expectedUpdatedAt: loadedCharacterUpdatedAt
    });

    currentCharacterId = null;
    currentCharacterCampaignId = "";
    loadedCharacterUpdatedAt = null;
    loadedCharacterLiveUpdatedAt = null;
    markCharacterClean();

    if (document.body.classList.contains("character-detail-page")) {
      window.location.assign("/characters.html");
      return;
    }

    await renderCharacterList();
    showStartPage();
    alert("Character deleted!");
  } catch (error) {
    console.error(error);
    alert(error.message || "Error deleting character.");
  }
}

async function copyCurrentCharacter() {
  if (!currentCharacterId) return;
  if (!loadedCharacterUpdatedAt) {
    alert("Save this character before copying it.");
    return;
  }
  if (hasUnsavedCharacterChanges()) {
    alert("Save your character changes before copying it.");
    return;
  }

  try {
    const version = new URLSearchParams(window.location.search).get("version")?.trim() || "";
    const copied = await characterStorage.copyCharacterData(currentCharacterId, version);
    await renderCharacterList();
    showToast(`Character copied as ${copied.summary?.name || "Unnamed Character Copy"}`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Error copying character.", { variant: "error" });
  }
}

function showStartPage() {
  document.getElementById("startPage").style.display = "block";
  document.querySelector(".sheet").style.display = "none";
  document.querySelector(".sheet-toolbar").style.display = "none";
  stopSheetHPPolling();
  startIndexPolling();
}

function showSheet() {
  document.getElementById("startPage").style.display = "none";
  document.querySelector(".sheet").style.display = "block";
  document.querySelector(".sheet-toolbar").style.display = "flex";
  stopIndexPolling();
  startSheetHPPolling();
}
