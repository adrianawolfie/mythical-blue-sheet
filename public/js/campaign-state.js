// Mythical Blue · shared campaign state
// Stores one shared campaign-state JSON file through the server API.

(() => {
  const DEFAULT_STATE = {
    schemaVersion: 1,
    updatedAt: null,
    calendarDate: {
      year: 4520,
      month: 3,
      day: 28,
      special: null
    },
    daysTraveled: 0
  };

  function normalizeState(state = {}) {
    const date = state.calendarDate || {};

    return {
      schemaVersion: 1,
      updatedAt: state.updatedAt || null,
      calendarDate: {
        year: Number(date.year) || DEFAULT_STATE.calendarDate.year,
        month:
          date.month === null
            ? null
            : Number(date.month) || DEFAULT_STATE.calendarDate.month,
        day:
          date.day === null
            ? null
            : Number(date.day) || DEFAULT_STATE.calendarDate.day,
        special:
          date.special === "intercalis" || date.special === "aenaris"
            ? date.special
            : null
      },
      daysTraveled: Math.max(0, Number(state.daysTraveled) || 0)
    };
  }

  async function parseJsonResponse(response, message) {
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error || message);
    }

    return body;
  }

  window.campaignStateStorage = {
    async init() {},

    async loadCampaignState() {
      const response = await fetch(`/api/campaign-state?cacheBust=${Date.now()}`, { cache: "no-store" });

      return normalizeState(
        await parseJsonResponse(
          response,
          "Could not load shared campaign state."
        )
      );
    },

    async saveCampaignState(state) {
      const response = await fetch("/api/campaign-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(normalizeState(state))
      });

      return normalizeState(
        await parseJsonResponse(
          response,
          "Could not save shared campaign state."
        )
      );
    }
  };
})();
