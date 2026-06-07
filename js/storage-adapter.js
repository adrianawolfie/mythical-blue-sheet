(() => {
  const config = window.APP_CONFIG || {};
  const mode = config.storageMode || "netlify";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function parseJsonResponse(response, fallbackMessage) {
    let result = {};

    try {
      result = await response.json();
    } catch {
      // Keep a useful error message when the server does not return JSON.
    }

    if (!response.ok) {
      throw new Error(result.error || fallbackMessage);
    }

    return result;
  }

  function summarize(character) {
    const summary = character.summary || {};

    return {
      id: character.id,
      name: summary.name || "Unnamed Character",
      armorClass: summary.armorClass || "",
      hpCurrent: summary.hpCurrent || "",
      hpMax: summary.hpMax || "",
      tempHp: summary.tempHp || "",
      passivePerception: summary.passivePerception || "",
      currentConditions: summary.currentConditions || "",
      updatedAt: character.updatedAt || ""
    };
  }

  function createNetlifyAdapter() {
    return {
      canReset: false,

      async init() {},

      async listCharacterData() {
        const response = await fetch(
          `/.netlify/functions/get-character-index?cacheBust=${Date.now()}`,
          { cache: "no-store" }
        );

        return parseJsonResponse(response, "Could not load character index.");
      },

      async loadCharacterData(id) {
        const response = await fetch(
          `/.netlify/functions/get-character?id=${encodeURIComponent(id)}&cacheBust=${Date.now()}`,
          { cache: "no-store" }
        );

        return parseJsonResponse(response, "Could not load character.");
      },

      async saveCharacterData(character) {
        const response = await fetch("/.netlify/functions/save-character", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(character)
        });

        return parseJsonResponse(response, "Failed to save character.");
      },

      async saveCharacterStatus({
        id,
        hpCurrent,
        hpMax,
        tempHp,
        armorClass,
        armorClassState,
        currentConditions
      }) {
        const response = await fetch("/.netlify/functions/save-character-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            hpCurrent,
            hpMax,
            tempHp,
            armorClass,
            armorClassState,
            currentConditions
          })
        });

        return parseJsonResponse(response, "Failed to save live character summary.");
      },

      async deleteCharacterData(payload) {
        const response = await fetch("/.netlify/functions/delete-character", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        return parseJsonResponse(response, "Failed to delete character.");
      }
    };
  }

  function createLocalAdapter() {
    const storageKey =
      config.localStorageKey || "mythicalBlueSheetTestCharactersV2";

    const seedIndexUrl =
      config.seedIndexUrl || "characters/test-character-index.json";

    function readCharacters() {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    }

    function writeCharacters(characters) {
      localStorage.setItem(storageKey, JSON.stringify(characters));
    }

    async function loadSeeds() {
      const indexResponse = await fetch(
        `${seedIndexUrl}?cacheBust=${Date.now()}`,
        { cache: "no-store" }
      );

      const seedIndex = await parseJsonResponse(
        indexResponse,
        "Could not load local test seed index."
      );

      const characters = {};

      for (const entry of seedIndex) {
        const response = await fetch(
          `${entry.file}?cacheBust=${Date.now()}`,
          { cache: "no-store" }
        );

        const character = await parseJsonResponse(
          response,
          `Could not load seed character ${entry.id}.`
        );

        characters[character.id] = character;
      }

      writeCharacters(characters);
      return characters;
    }

    return {
      canReset: true,

      async init() {
        if (!localStorage.getItem(storageKey)) {
          await loadSeeds();
        }
      },

      async resetTestData() {
        await loadSeeds();
      },

      async listCharacterData() {
        return Object.values(readCharacters())
          .map(summarize)
          .sort((a, b) =>
            String(a.name || "").localeCompare(
              String(b.name || ""),
              undefined,
              { sensitivity: "base" }
            )
          );
      },

      async loadCharacterData(id) {
        const character = readCharacters()[id];

        if (!character) {
          throw new Error("Could not find this local test character.");
        }

        return clone(character);
      },

      async saveCharacterData(incomingCharacter) {
        const characters = readCharacters();
        const existingCharacter = characters[incomingCharacter.id];

        if (existingCharacter) {
          const expectedUpdatedAt = incomingCharacter.expectedUpdatedAt || null;
          const latestUpdatedAt = existingCharacter.updatedAt || null;

          if (!expectedUpdatedAt) {
            throw new Error(
              "Save blocked: reopen this character from the index before editing it."
            );
          }

          if (latestUpdatedAt && expectedUpdatedAt !== latestUpdatedAt) {
            throw new Error(
              "Save blocked: this local test character changed after you opened it."
            );
          }
        }

        const savedAt = new Date().toISOString();
        const characterToSave = {
          ...clone(incomingCharacter),
          updatedAt: savedAt
        };

        delete characterToSave.expectedUpdatedAt;

        characters[characterToSave.id] = characterToSave;
        writeCharacters(characters);

        return {
          success: true,
          updatedAt: savedAt
        };
      },

      async saveCharacterStatus({
        id,
        hpCurrent,
        hpMax,
        tempHp,
        armorClass,
        armorClassState,
        currentConditions
      }) {
        const characters = readCharacters();
        const character = characters[id];

        if (!character) {
          throw new Error("Could not find this local test character.");
        }

        const savedAt = new Date().toISOString();

        character.summary = character.summary || {};
        character.fields  = character.fields  || {};

        character.summary.hpCurrent = hpCurrent;
        character.summary.hpMax = hpMax;
        character.summary.tempHp = tempHp;
        character.summary.armorClass = armorClass;
        character.summary.currentConditions = currentConditions;

        if (armorClassState && typeof armorClassState === "object") {
          character.customLists = character.customLists || {};
          character.customLists.armorClass = clone(armorClassState);
        }

        character.fields.hpCurrent = hpCurrent;
        character.fields.hpMax = hpMax;
        character.fields.tempHp = tempHp;
        character.fields.armorClass = armorClass;
        character.fields.currentConditions = currentConditions;

        character.updatedAt = savedAt;

        writeCharacters(characters);
        return { success: true, updatedAt: savedAt };
      },

      async deleteCharacterData({ id, expectedUpdatedAt }) {
        const characters = readCharacters();
        const existingCharacter = characters[id];

        if (!existingCharacter) {
          throw new Error("Could not find this local test character.");
        }

        if (
          expectedUpdatedAt &&
          existingCharacter.updatedAt &&
          expectedUpdatedAt !== existingCharacter.updatedAt
        ) {
          throw new Error(
            "Delete blocked: this local test character changed after you opened it."
          );
        }

        delete characters[id];
        writeCharacters(characters);

        return { success: true };
      }
    };
  }

  window.characterStorage =
    mode === "local" ? createLocalAdapter() : createNetlifyAdapter();
})();
