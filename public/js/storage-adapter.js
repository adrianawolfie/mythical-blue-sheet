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

      if (response.status !== 200) throw new Error("Failed to save character.");
      return {};
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
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}/status`, {
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

      if (response.status !== 200) throw new Error("Failed to save live character summary.");
      return {};
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
