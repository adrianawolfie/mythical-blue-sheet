// Mythical Blue · Attacks
// Weapons and damage spells: add from inventory or the spell list, with live bonuses.

// Damage; properties; mastery of the SRD 5.2.1 weapons (from data/srd-items.json).
const SRD_WEAPONS = {
  "Battleaxe": "1d8 Slashing; Versatile (1d10); Topple",
  "Blowgun": "1 Piercing; Ammunition (Range 25/100; Needle), Loading; Vex",
  "Club": "1d4 Bludgeoning; Light; Slow",
  "Dagger": "1d4 Piercing; Finesse, Light, Thrown (Range 20/60); Nick",
  "Dart": "1d4 Piercing; Finesse, Thrown (Range 20/60); Vex",
  "Flail": "1d8 Bludgeoning; Sap",
  "Glaive": "1d10 Slashing; Heavy, Reach, Two-Handed; Graze",
  "Greataxe": "1d12 Slashing; Heavy, Two-Handed; Cleave",
  "Greatclub": "1d8 Bludgeoning; Two-Handed; Push",
  "Greatsword": "2d6 Slashing; Heavy, Two-Handed; Graze",
  "Halberd": "1d10 Slashing; Heavy, Reach, Two-Handed; Cleave",
  "Hand Crossbow": "1d6 Piercing; Ammunition (Range 30/120; Bolt), Light, Loading; Vex",
  "Handaxe": "1d6 Slashing; Light, Thrown (Range 20/60); Vex",
  "Heavy Crossbow": "1d10 Piercing; Ammunition (Range 100/400; Bolt), Heavy, Loading, Two-Handed; Push",
  "Javelin": "1d6 Piercing; Thrown (Range 30/120); Slow",
  "Lance": "1d10 Piercing; Heavy, Reach, Two-Handed (unless mounted); Topple",
  "Light Crossbow": "1d8 Piercing; Ammunition (Range 80/320; Bolt), Loading, Two-Handed; Slow",
  "Light Hammer": "1d4 Bludgeoning; Light, Thrown (Range 20/60); Nick",
  "Longbow": "1d8 Piercing; Ammunition (Range 150/600; Arrow), Heavy, Two-Handed; Slow",
  "Longsword": "1d8 Slashing; Versatile (1d10); Sap",
  "Mace": "1d6 Bludgeoning; Sap",
  "Maul": "2d6 Bludgeoning; Heavy, Two-Handed; Topple",
  "Morningstar": "1d8 Piercing; Sap",
  "Musket": "1d12 Piercing; Ammunition (Range 40/120; Bullet), Loading, Two-Handed; Slow",
  "Pike": "1d10 Piercing; Heavy, Reach, Two-Handed; Push",
  "Pistol": "1d10 Piercing; Ammunition (Range 30/90; Bullet), Loading; Vex",
  "Quarterstaff": "1d6 Bludgeoning; Versatile (1d8); Topple",
  "Rapier": "1d8 Piercing; Finesse; Vex",
  "Scimitar": "1d6 Slashing; Finesse, Light; Nick",
  "Shortbow": "1d6 Piercing; Ammunition (Range 80/320; Arrow), Two-Handed; Vex",
  "Shortsword": "1d6 Piercing; Finesse, Light; Vex",
  "Sickle": "1d4 Slashing; Light; Nick",
  "Sling": "1d4 Bludgeoning; Ammunition (Range 30/120; Bullet); Slow",
  "Spear": "1d6 Piercing; Thrown (Range 20/60), Versatile (1d8); Sap",
  "Trident": "1d8 Piercing; Thrown (Range 20/60), Versatile (1d10); Topple",
  "War Pick": "1d8 Piercing; Versatile (1d10); Sap",
  "Warhammer": "1d8 Bludgeoning; Versatile (1d10); Push",
  "Whip": "1d4 Slashing; Finesse, Reach; Slow"
};

function attackModifier(ability) {
  return numberFieldValue(`${ability}Modifier`) ?? 0;
}

function damageWithModifier(dice, modifier) {
  return modifier ? `${dice}${modifier > 0 ? "+" : ""}${modifier}` : dice;
}

// Finds the SRD weapon a row name refers to, e.g. "+1 Rapier" or "Scimitar (Bladesong)".
function matchWeapon(name) {
  const magic = name.trim().match(/^\+(\d)\s+(.*)$/);
  const rest = (magic ? magic[2] : name).trim().toLowerCase();
  const weaponName = Object.keys(SRD_WEAPONS)
    .filter(key => rest === key.toLowerCase() || new RegExp(`^${key.toLowerCase()}(?![a-z])`).test(rest))
    .sort((a, b) => b.length - a.length)[0];
  return weaponName ? { weaponName, bonus: magic ? Number(magic[1]) : 0 } : null;
}

function findSpellRow(name) {
  const key = name.trim().toLowerCase();
  if (!key || typeof collectSpellRows !== "function") return null;
  return collectSpellRows().find(spell => String(spell.name || "").trim().toLowerCase() === key) || null;
}

// Works out the attack bonus or save DC, damage, and notes for a weapon, damage spell, or unarmed strike.
function describeAttack(name = "") {
  const proficiencyBonus = numberFieldValue("proficiencyBonus") ?? 0;
  const strength = attackModifier("strength");

  if (/^unarmed strike$/i.test(name.trim())) {
    return { atk: signedNumber(strength + proficiencyBonus), damage: `${Math.max(1, 1 + strength)} bludgeoning`, notes: "Melee · Reach 5 ft" };
  }

  const weapon = matchWeapon(name);
  if (weapon) {
    const [damage, ...rest] = SRD_WEAPONS[weapon.weaponName].split(";").map(part => part.trim());
    const mastery = rest.pop();
    const properties = rest.join("; ");
    const [dice, damageType] = damage.split(" ");
    const dexterity = attackModifier("dexterity");
    const modifier = /ammunition/i.test(properties) ? dexterity
      : /finesse/i.test(properties) ? Math.max(strength, dexterity)
      : strength;
    return {
      atk: signedNumber(modifier + proficiencyBonus + weapon.bonus),
      damage: `${damageWithModifier(dice, modifier + weapon.bonus)} ${damageType.toLowerCase()}`,
      notes: [properties, mastery && `Mastery: ${mastery}`].filter(Boolean).join(" · ")
    };
  }

  const spell = findSpellRow(name);
  if (!spell) return null;
  const details = String(spell.details || "");
  const saveAbility = String(spell.attackSave || "").match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/)?.[1] ||
    ABILITY_ABBREVIATIONS && Object.keys(ABILITY_ABBREVIATIONS).find(abbreviation =>
      new RegExp(`${ABILITY_ABBREVIATIONS[abbreviation]} saving throw`, "i").test(details));
  const spellAttack = /spell attack/i.test(spell.attackSave || "") || (!saveAbility && /spell attack/i.test(details));
  const parsedDamage = details.match(/(\d+d\d+(?:\s*\+\s*\d+)?)\s+(\w+)\s+damage/i);
  let dice = String(spell.damageHealing || "").split("/")[0].match(/\d+d\d+(?:\s*\+\s*\d+(?:d\d+)?)*/)?.[0] || parsedDamage?.[1] || "";
  const damageType = String(spell.damageType || "").split(/\s|&/)[0] || parsedDamage?.[2] || "";
  // Only damaging spells count as attacks; healing and save-only spells are left out.
  if (!dice || /heal/i.test(damageType) || !(damageType || spellAttack || saveAbility)) return null;

  const level = Number.parseInt(getFieldValue("level"), 10) || 1;
  const cantripTier = 1 + (level >= 5) + (level >= 11) + (level >= 17);
  let notes = [spell.level === "C" ? "Cantrip" : spell.level ? `Level ${spell.level}` : "", String(spell.range || "").replace(/\s+System Reference.*$/i, "")];
  if (spell.level === "C" && /^eldritch blast$/i.test(name.trim())) {
    notes.push(`${cantripTier} beam${cantripTier === 1 ? "" : "s"}`);
  } else if (spell.level === "C" && String(spell.damageHealing || "").includes("/")) {
    dice = dice.replace(/^(\d+)d/, (match, count) => `${Number(count) * cantripTier}d`);
  }

  return {
    atk: spellAttack ? String(getFieldValue("spellAttackBonus") || "") : saveAbility ? `DC ${getFieldValue("spellSaveDc")} ${saveAbility}` : "",
    damage: [dice, damageType.toLowerCase()].filter(Boolean).join(" "),
    notes: notes.filter(Boolean).join(" · ")
  };
}

function addWeaponRow(data = {}) {
  const list = document.getElementById("weaponBody");
  if (!list) return;

  const row = document.createElement("div");
  row.className = "attack-row weapon-row";
  row.innerHTML = `
    <input class="attack-atk weapon-atk" type="text" placeholder="+0" aria-label="Attack bonus or save DC" value="${escapeHtml(data.atk || "")}">
    <div class="attack-main">
      <input class="attack-name weapon-name" type="text" placeholder="Attack name" aria-label="Attack name" value="${escapeHtml(data.name || "")}">
      <input class="attack-notes weapon-notes" type="text" placeholder="Notes" aria-label="Notes" value="${escapeHtml(data.notes || "")}" title="${escapeHtml(data.notes || "")}">
    </div>
    <input class="attack-damage weapon-damage" type="text" placeholder="Damage" aria-label="Damage and type" value="${escapeHtml(data.damage || "")}">
    <div class="attack-edit-tools">
      <button type="button" class="row-up" title="Move up" aria-label="Move up">↑</button>
      <button type="button" class="row-down" title="Move down" aria-label="Move down">↓</button>
      <button type="button" class="row-delete" title="Remove" aria-label="Remove attack">×</button>
    </div>
  `;

  row.querySelector(".attack-notes").addEventListener("input", event => { event.target.title = event.target.value; });
  row.querySelector(".attack-atk").addEventListener("input", () => fitAttackBonus(row));
  row.querySelector(".row-up").addEventListener("click", () => row.previousElementSibling && list.insertBefore(row, row.previousElementSibling));
  row.querySelector(".row-down").addEventListener("click", () => row.nextElementSibling && list.insertBefore(row.nextElementSibling, row));
  row.querySelector(".row-delete").addEventListener("click", () => {
    if (confirm("Remove this attack?")) row.remove();
  });

  list.appendChild(row);
  recalculateAttacks();
}

// Longer values such as "DC 15 DEX" get a smaller font so they fit the pill.
function fitAttackBonus(row) {
  const input = row.querySelector(".attack-atk");
  input.classList.toggle("is-long", input.value.trim().length > 4);
}

function resetWeaponRows(rows = [{ name: "Unarmed Strike" }]) {
  const list = document.getElementById("weaponBody");
  if (!list) return;
  list.innerHTML = "";
  rows.filter(row => row.name || row.atk || row.damage || row.notes).forEach(row => addWeaponRow(row));
}

function collectWeaponRows() {
  return Array.from(document.querySelectorAll("#weaponBody .weapon-row")).map(row => ({
    name: row.querySelector(".weapon-name")?.value || "",
    atk: row.querySelector(".weapon-atk")?.value || "",
    damage: row.querySelector(".weapon-damage")?.value || "",
    notes: row.querySelector(".weapon-notes")?.value || ""
  }));
}

// Keeps attack bonuses and damage in step with level and ability scores, unless the player typed their own.
function recalculateAttacks() {
  document.querySelectorAll("#weaponBody .attack-row").forEach(row => {
    const described = describeAttack(row.querySelector(".attack-name").value);
    if (!described) return fitAttackBonus(row);
    applyDerivedValue(row.querySelector(".attack-atk"), described.atk);
    applyDerivedValue(row.querySelector(".attack-damage"), described.damage);
    const notes = row.querySelector(".attack-notes");
    if (!notes.value.trim() && document.activeElement !== notes) {
      notes.value = described.notes;
      notes.title = described.notes;
    }
    fitAttackBonus(row);
  });
}

// "+ Add Attack" menu with weapons from the inventory, damage spells from the spell list, and extras.
function buildAttackMenuItems() {
  const existing = new Set(collectWeaponRows().map(row => row.name.trim().toLowerCase()));
  const inventory = typeof collectUnifiedInventoryRows === "function" ? collectUnifiedInventoryRows() : [];
  const weapons = [...new Set(inventory.map(item => String(item.name || "").trim()))]
    .filter(name => name && matchWeapon(name));
  const spells = (typeof collectSpellRows === "function" ? collectSpellRows() : [])
    .filter(spell => spell.name && describeAttack(spell.name))
    .sort((a, b) => (a.level === "C" ? 0 : Number(a.level) || 99) - (b.level === "C" ? 0 : Number(b.level) || 99) || a.name.localeCompare(b.name));

  return [
    { heading: "From your inventory", items: weapons, empty: "No weapons in your inventory yet." },
    { heading: "From your spell list", items: spells.map(spell => spell.name), empty: "No damage spells in your spell list yet." },
    { heading: "Other", items: ["Unarmed Strike"], custom: true }
  ].map(group => ({ ...group, items: group.items.map(name => ({ name, added: existing.has(name.toLowerCase()) })) }));
}

function renderAttackMenu(menu) {
  menu.innerHTML = buildAttackMenuItems().map(group => `
    <div class="attack-menu-group">
      <div class="attack-menu-heading">${escapeHtml(group.heading)}</div>
      ${group.items.map(({ name, added }) => {
        const described = describeAttack(name);
        const hint = added ? "Added" : [described?.atk, described?.damage].filter(Boolean).join(" · ");
        return `<button type="button" class="attack-menu-item" data-attack-name="${escapeHtml(name)}" ${added ? "disabled" : ""}><span>${escapeHtml(name)}</span><em>${escapeHtml(hint)}</em></button>`;
      }).join("")}
      ${!group.items.length && group.empty ? `<p class="attack-menu-empty">${escapeHtml(group.empty)}</p>` : ""}
      ${group.custom ? '<button type="button" class="attack-menu-item" data-attack-custom="true"><span>Custom attack…</span><em>Type your own</em></button>' : ""}
    </div>
  `).join("");
}

function toggleAttackMenu(button) {
  const menu = document.getElementById("attackAddMenu");
  if (!menu) return;
  const open = menu.hidden;
  if (open) renderAttackMenu(menu);
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

document.addEventListener("click", event => {
  const menu = document.getElementById("attackAddMenu");
  if (!menu || menu.hidden) return;
  const item = event.target.closest(".attack-menu-item:not(:disabled)");
  if (item) {
    if (item.dataset.attackCustom) {
      addWeaponRow({});
      document.querySelector("#weaponBody .attack-row:last-child .attack-name")?.focus();
    } else {
      addWeaponRow({ name: item.dataset.attackName, ...describeAttack(item.dataset.attackName) });
    }
    markCharacterDirty();
  }
  if (item || !event.target.closest(".attack-add-wrap")) {
    menu.hidden = true;
    document.getElementById("attackAddButton")?.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const menu = document.getElementById("attackAddMenu");
  if (menu) menu.hidden = true;
});

resetWeaponRows();
