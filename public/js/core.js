// Mythical Blue · Core character data
// Shared state, schema migration, loading, saving, and navigation.

function sw(name, btn) {
    document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
    document.getElementById('pg-' + name).classList.add('on');
    btn.classList.add('on');
  }

let currentCharacterId = null;
let loadedCharacterUpdatedAt = null;
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
    inspiration: document.querySelector(".insp")?.textContent.trim() === "✦",
    skillProficiencies: getToggleStates(".sk .dot"),
    deathSaves: getToggleStates(".dsbox .svdie"),
    exhaustion: getToggleStates(".exhaustion-row .svdie")
  };
}

function applyUiState(uiState = {}) {
  const inspiration = document.querySelector(".insp");
  if (inspiration) {
    inspiration.textContent = uiState.inspiration === true ? "✦" : "○";
  }

  applyToggleStates(".sk .dot", uiState.skillProficiencies || []);
  applyToggleStates(".dsbox .svdie", uiState.deathSaves || []);
  applyToggleStates(".exhaustion-row .svdie", uiState.exhaustion || []);
}

let saveToastTimer = null;
let saveToastElement = null;

function showSaveToast(message) {
  let container = document.getElementById("saveToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "saveToastContainer";
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.zIndex = "9999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "flex-end";
    container.style.gap = "8px";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.maxWidth = "320px";
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "10px";
  toast.style.background = "rgba(20, 83, 45, 0.96)";
  toast.style.color = "#ecfdf5";
  toast.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.24)";
  toast.style.border = "1px solid rgba(167, 243, 208, 0.28)";
  toast.style.font = "600 14px/1.3 system-ui, sans-serif";
  toast.style.letterSpacing = "0.01em";
  toast.style.pointerEvents = "none";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(-6px)";
  toast.style.transition = "opacity 160ms ease, transform 160ms ease";

  if (saveToastElement) {
    saveToastElement.remove();
    saveToastElement = null;
  }

  container.appendChild(toast);
  saveToastElement = toast;

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  if (saveToastTimer) {
    clearTimeout(saveToastTimer);
  }
  saveToastTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => {
      toast.remove();
      if (saveToastElement === toast) saveToastElement = null;
    }, 180);
  }, 3000);
}

function collectCharacterData() {
  const fields = collectNamedFields();

return {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: currentCharacterId || crypto.randomUUID(),
  expectedUpdatedAt: loadedCharacterUpdatedAt,
  updatedAt: new Date().toISOString(),
summary: {
  name: getFieldValue("characterName") || "Unnamed Character",
  armorClass: getFieldValue("armorClass"),
  hpCurrent: getFieldValue("hpCurrent"),
  hpMax: getFieldValue("hpMax"),
  tempHp: getFieldValue("tempHp"),
  hitDice: getFieldValue("hitDice"),
  passivePerception: getFieldValue("passivePerception"),
  currentConditions: getFieldValue("currentConditions")
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
  armorClass: collectArmorClassState()
}
  };
}

function loadCharacter(character) {
  currentCharacterId = character.id;
  loadedCharacterUpdatedAt = character.updatedAt || null;

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
  character.summary?.armorClass ?? normalizedFields.armorClass ?? ""
);
renderProficiencyRows(
  character.customLists?.proficiencies ||
  proficienciesFromNamedFields(normalizedFields)
);
renderDefenseRows(character.customLists?.defenses || {});
applyUiState(character.uiState || {});
focusedCondition = "";
renderSelectedConditions();

// HP is also stored explicitly in the character summary.
// Reapply it by id so layout changes cannot shift these two fields.
const hpCurrentInput = document.getElementById("hpCurrentInput");
const hpMaxInput = document.getElementById("hpMaxInput");

if (hpCurrentInput && character.summary?.hpCurrent !== undefined) {
  hpCurrentInput.value = character.summary.hpCurrent || "";
}

if (hpMaxInput && character.summary?.hpMax !== undefined) {
  hpMaxInput.value = character.summary.hpMax || "";
}

// Load Temp HP and Hit Dice by ID so they survive DOM reordering
const tempHpInput = document.getElementById("tempHpInput");
const hitDiceInput = document.getElementById("hitDiceInput");
if (tempHpInput && character.summary?.tempHp !== undefined) {
  tempHpInput.value = character.summary.tempHp || "";
}
if (hitDiceInput && character.summary?.hitDice !== undefined) {
  hitDiceInput.value = character.summary.hitDice || "";
}

updateHPBar(); // sync bar with loaded values

showSheet();
markCharacterClean();
}

async function saveCurrentCharacter(showAlert = true) {
  const data = collectCharacterData();

  try {
    const result = await characterStorage.saveCharacterData(data);

    currentCharacterId = data.id;
    loadedCharacterUpdatedAt = result.updatedAt || data.updatedAt;
    markCharacterClean();

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
  loadedCharacterUpdatedAt = null;

  getFields().forEach(field => {
    if (field.type === "checkbox") {
      field.checked = false;
    } else {
      field.value = "";
    }
  });

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
    loadedCharacterUpdatedAt = null;
    markCharacterClean();

    await renderCharacterList();
    showStartPage();
    alert("Character deleted!");
  } catch (error) {
    console.error(error);
    alert(error.message || "Error deleting character.");
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
