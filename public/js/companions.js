// Mythical Blue · Companions
// Familiars, pets, mounts, and other companions: stat cards, live hit points, and creature library imports.

const COMPANION_KINDS = ["Familiar", "Pet", "Mount", "Companion", "Summon", "Other"];
const COMPANION_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

// Current and temporary hit points per companion ID; saved as live state like the character's own HP.
let companionLive = {};

function companionModifier(score) {
  const value = Number.parseInt(score, 10);
  return Number.isFinite(value) ? signedNumber(Math.floor((value - 10) / 2)) : "—";
}

function companionField(label, className, value = "", { placeholder = "", wide = false, multiline = false } = {}) {
  const control = multiline
    ? `<textarea class="${className}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
    : `<input class="${className}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
  return `<label class="companion-field${wide ? " companion-field-wide" : ""}"><span>${label}</span>${control}</label>`;
}

function addCompanion(data = {}) {
  const list = document.getElementById("companionList");
  if (!list) return;

  const id = String(data.id || `companion-${crypto.randomUUID()}`);
  const abilities = data.abilities || {};
  const kind = COMPANION_KINDS.includes(data.kind) ? data.kind : "Familiar";
  const card = document.createElement("div");
  card.className = "companion-card";
  card.dataset.companionId = id;
  card.dataset.sourceId = String(data.sourceId || "");

  card.innerHTML = `
    <div class="companion-header">
      <div class="companion-title">
        <input class="companion-name" type="text" value="${escapeHtml(data.name || "")}" placeholder="Name" aria-label="Companion name">
        <div class="companion-subtitle">
          <select class="companion-kind" aria-label="Kind of companion">
            ${COMPANION_KINDS.map(option => `<option${option === kind ? " selected" : ""}>${option}</option>`).join("")}
          </select>
          <input class="companion-creature" type="text" value="${escapeHtml(data.creature || "")}" placeholder="Creature, e.g. Owl" aria-label="Creature">
          <input class="companion-size" type="text" value="${escapeHtml(data.size || "")}" placeholder="Size" aria-label="Size">
          <input class="companion-type" type="text" value="${escapeHtml(data.creatureType || "")}" placeholder="Type" aria-label="Creature type">
        </div>
      </div>
      <button type="button" class="companion-remove" title="Remove companion" aria-label="Remove companion">×</button>
    </div>

    <div class="companion-stats">
      <label class="companion-stat"><span>AC</span><input class="companion-ac" type="text" value="${escapeHtml(data.armorClass || "")}" placeholder="10"></label>
      <div class="companion-stat companion-hp">
        <span>Hit Points</span>
        <div class="companion-hp-row">
          <button type="button" class="companion-hp-btn" data-hp-step="-1" aria-label="Lose 1 hit point">−</button>
          <input class="companion-hp-current" type="text" inputmode="numeric" placeholder="0" aria-label="Current hit points">
          <em>/</em>
          <input class="companion-hp-max" type="text" inputmode="numeric" value="${escapeHtml(data.hpMax || "")}" placeholder="0" aria-label="Maximum hit points">
          <button type="button" class="companion-hp-btn" data-hp-step="1" aria-label="Gain 1 hit point">+</button>
        </div>
        <div class="companion-hp-bar" aria-hidden="true"><div></div></div>
      </div>
      <label class="companion-stat"><span>Temp HP</span><input class="companion-temp-hp" type="text" inputmode="numeric" placeholder="—"></label>
      <label class="companion-stat companion-stat-wide"><span>Speed</span><input class="companion-speed" type="text" value="${escapeHtml(data.speed || "")}" placeholder="30 ft."></label>
      <label class="companion-stat"><span>Initiative</span><input class="companion-initiative" type="text" value="${escapeHtml(data.initiative || "")}" placeholder="+0"></label>
      <label class="companion-stat"><span>CR</span><input class="companion-cr" type="text" value="${escapeHtml(data.challengeRating || "")}" placeholder="—"></label>
    </div>

    <div class="companion-abilities">
      ${COMPANION_ABILITIES.map(ability => `
        <label class="companion-ability">
          <span>${ability.toUpperCase()}</span>
          <input class="companion-ability-score" data-ability="${ability}" type="text" inputmode="numeric" value="${escapeHtml(abilities[ability] || "")}" placeholder="10">
          <em class="companion-ability-mod">${companionModifier(abilities[ability])}</em>
        </label>`).join("")}
    </div>

    <details class="companion-details">
      <summary>Skills, senses, traits & actions</summary>
      <div class="companion-details-grid">
        ${companionField("Skills", "companion-skills", data.skills, { placeholder: "Perception +3, Stealth +4" })}
        ${companionField("Senses", "companion-senses", data.senses, { placeholder: "Darkvision 60 ft.; Passive Perception 13" })}
        ${companionField("Languages", "companion-languages", data.languages, { placeholder: "Understands Common but can't speak" })}
        ${companionField("Hit Dice", "companion-hit-dice", data.hitDice, { placeholder: "1d4" })}
        ${companionField("Traits", "companion-traits", data.traits, { wide: true, multiline: true, placeholder: "Special traits, e.g. Flyby, Keen Senses…" })}
        ${companionField("Actions", "companion-actions", data.actions, { wide: true, multiline: true, placeholder: "Attacks and other actions…" })}
        ${companionField("Notes", "companion-notes", data.notes, { wide: true, multiline: true, placeholder: "Personality, bond, where you met, commands it knows…" })}
      </div>
    </details>
  `;

  list.appendChild(card);
  bindCompanionCard(card);

  if (!companionLive[id]) companionLive[id] = { hpCurrent: String(data.hpMax || ""), tempHp: "" };
  renderCompanionHp(card);

  if (!data.name) card.querySelector(".companion-name").focus();
}

function bindCompanionCard(card) {
  const id = card.dataset.companionId;

  card.querySelector(".companion-remove").addEventListener("click", () => {
    const name = card.querySelector(".companion-name").value.trim() || "this companion";
    if (!confirm(`Remove ${name}?`)) return;
    card.remove();
    delete companionLive[id];
    markCharacterDirty();
    scheduleHPAutoSave({ companions: companionLive });
  });

  card.querySelectorAll(".companion-ability-score").forEach(input => {
    input.addEventListener("input", () => {
      input.parentElement.querySelector(".companion-ability-mod").textContent = companionModifier(input.value);
    });
  });

  card.querySelectorAll(".companion-hp-btn").forEach(button => {
    button.addEventListener("click", () => {
      const max = Number.parseInt(card.querySelector(".companion-hp-max").value, 10);
      const current = Number.parseInt(card.querySelector(".companion-hp-current").value, 10) || 0;
      const next = Math.max(0, current + Number(button.dataset.hpStep));
      card.querySelector(".companion-hp-current").value = String(Number.isFinite(max) ? Math.min(max, next) : next);
      saveCompanionHp(card);
    });
  });

  card.querySelectorAll(".companion-hp-current, .companion-temp-hp").forEach(input => {
    input.addEventListener("input", () => saveCompanionHp(card));
  });

  card.querySelector(".companion-hp-max").addEventListener("input", () => renderCompanionHp(card, { keepInputs: true }));
}

function saveCompanionHp(card) {
  companionLive = {
    ...companionLive,
    [card.dataset.companionId]: {
      hpCurrent: card.querySelector(".companion-hp-current").value.trim(),
      tempHp: card.querySelector(".companion-temp-hp").value.trim()
    }
  };
  renderCompanionHp(card, { keepInputs: true });
  scheduleHPAutoSave({ companions: companionLive });
}

// Shows a companion's current and temporary hit points and fills its HP bar.
function renderCompanionHp(card, { keepInputs = false } = {}) {
  const live = companionLive[card.dataset.companionId] || {};
  const max = card.querySelector(".companion-hp-max").value.trim();
  const currentInput = card.querySelector(".companion-hp-current");
  const tempInput = card.querySelector(".companion-temp-hp");

  if (!keepInputs) {
    // No recorded current HP means the companion is at full health.
    if (document.activeElement !== currentInput) currentInput.value = live.hpCurrent || max;
    if (document.activeElement !== tempInput) tempInput.value = live.tempHp ?? "";
  }

  const current = Number.parseInt(currentInput.value, 10) || 0;
  const maximum = Number.parseInt(max, 10) || 0;
  const percent = maximum > 0 ? Math.max(0, Math.min(100, Math.round((current / maximum) * 100))) : 0;
  const bar = card.querySelector(".companion-hp-bar > div");
  bar.style.width = `${percent}%`;
  bar.classList.toggle("danger", percent > 0 && percent <= 50);
}

function applyCompanionLive(liveCompanions) {
  companionLive = liveCompanions && typeof liveCompanions === "object" ? { ...liveCompanions } : {};
  document.querySelectorAll("#companionList .companion-card").forEach(card => renderCompanionHp(card));
}

// A long rest restores every companion's hit points and clears temporary hit points.
function restCompanions() {
  document.querySelectorAll("#companionList .companion-card").forEach(card => {
    companionLive[card.dataset.companionId] = { hpCurrent: card.querySelector(".companion-hp-max").value.trim(), tempHp: "" };
    renderCompanionHp(card);
  });
  return companionLive;
}

function renderCompanions(companions = []) {
  const list = document.getElementById("companionList");
  if (!list) return;
  list.innerHTML = "";
  (companions || []).forEach(companion => addCompanion(companion));
}

function collectCompanions() {
  return Array.from(document.querySelectorAll("#companionList .companion-card")).map(card => {
    const value = selector => card.querySelector(selector)?.value.trim() || "";
    return {
      id: card.dataset.companionId,
      name: value(".companion-name"),
      kind: value(".companion-kind"),
      creature: value(".companion-creature"),
      sourceId: card.dataset.sourceId || "",
      size: value(".companion-size"),
      creatureType: value(".companion-type"),
      armorClass: value(".companion-ac"),
      hpMax: value(".companion-hp-max"),
      hitDice: value(".companion-hit-dice"),
      speed: value(".companion-speed"),
      initiative: value(".companion-initiative"),
      challengeRating: value(".companion-cr"),
      abilities: Object.fromEntries(
        Array.from(card.querySelectorAll(".companion-ability-score")).map(input => [input.dataset.ability, input.value.trim()])
      ),
      skills: value(".companion-skills"),
      senses: value(".companion-senses"),
      languages: value(".companion-languages"),
      traits: value(".companion-traits"),
      actions: value(".companion-actions"),
      notes: value(".companion-notes")
    };
  });
}

// Turns an SRD stat block (data/srd-statblocks.json) into companion fields. Ability scores, skills,
// senses, languages, traits, and actions only exist in the stat block's text, so they are read from it.
function companionFromStatblock(statblock = {}) {
  const text = String(statblock.text || "").replace(/−/g, "-");
  const flat = text.replace(/\s+/g, " ");
  const abilities = {};
  for (const match of flat.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\b/g)) {
    abilities[match[1].toLowerCase()] ??= match[2];
  }

  const metaEnd = "(?= Skills | Senses | Languages | CR | Resistances | Immunities | Vulnerabilities | Gear | Traits | Actions |$)";
  const meta = label => flat.match(new RegExp(` ${label} (.*?)${metaEnd}`))?.[1].trim() || "";

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headings = ["Traits", "Actions", "Bonus Actions", "Reactions", "Legendary Actions"];
  const section = heading => {
    const start = lines.indexOf(heading);
    if (start < 0) return "";
    const end = lines.findIndex((line, index) => index > start && headings.includes(line));
    // Put each named entry ("Keen Sight. …") on its own line.
    return lines.slice(start + 1, end < 0 ? lines.length : end).join(" ")
      .replace(/([.!?]) (?=[A-Z][\w’'()-]*(?: [\w’'()-]+){0,4}\. )/g, "$1\n");
  };
  const actions = [
    section("Actions"),
    section("Bonus Actions") && `Bonus Actions\n${section("Bonus Actions")}`,
    section("Reactions") && `Reactions\n${section("Reactions")}`
  ].filter(Boolean).join("\n\n");

  const name = String(statblock.name || "");
  const kind = /horse|pony|mule|camel|elk|mastiff/i.test(name) ? "Mount"
    : String(statblock.challengeRating) === "0" ? "Familiar"
    : "Companion";

  return {
    name,
    kind,
    creature: name,
    sourceId: String(statblock.id || ""),
    size: String(statblock.size || ""),
    creatureType: String(statblock.type || ""),
    armorClass: String(statblock.armorClass || ""),
    hpMax: String(statblock.hp || ""),
    hitDice: String(statblock.hpFormula || "").replace(/\u2212/g, "-"),
    speed: String(statblock.speed || ""),
    initiative: String(statblock.initiative || "").replace(/\u2212/g, "-"),
    challengeRating: String(statblock.challengeRating || ""),
    abilities,
    skills: meta("Skills"),
    senses: meta("Senses"),
    languages: meta("Languages"),
    traits: section("Traits"),
    actions,
    notes: ""
  };
}

renderCompanions([]);
