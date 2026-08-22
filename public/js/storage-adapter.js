(() => {
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

  window.characterStorage = {
    canReset: false,

    async init() {},

    async listCharacterData() {
      if (window.__MYTHICAL_BLUE_CHARACTERS__) {
        const characters = window.__MYTHICAL_BLUE_CHARACTERS__;
        delete window.__MYTHICAL_BLUE_CHARACTERS__;
        return characters;
      }

      const response = await fetch(`/api/characters?cacheBust=${Date.now()}`, { cache: "no-store" });

      return parseJsonResponse(response, "Could not load character index.");
    },

    async loadCharacterData(id) {
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}?cacheBust=${Date.now()}`, { cache: "no-store" });

      return parseJsonResponse(response, "Could not load character.");
    },

    async saveCharacterData(character) {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(character)
      });

      return parseJsonResponse(response, "Failed to save character.");
    },

    async saveCharacterLive({ id, ...fields }) {
      const liveFieldNames = new Set([
        "hpCurrent",
        "hpOverride",
        "tempHp",
        "conditions",
        "inspiration",
        "exhaustionLevel",
        "deathSaves",
        "hitDiceSpent",
        "activeArmorClassModifiers"
      ]);
      const body = Object.fromEntries(
        Object.entries(fields).filter(([name, value]) =>
          liveFieldNames.has(name) && value !== undefined
        )
      );
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}/live`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      return parseJsonResponse(response, "Failed to save live character state.");
    },

    async deleteCharacterData(payload) {
      const response = await fetch(`/api/characters/${encodeURIComponent(payload.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status !== 200) throw new Error("Failed to delete character.");
      return {};
    }
  };
})();
