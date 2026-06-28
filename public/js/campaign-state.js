// Mythical Blue · shared campaign state
// GitHub Pages uses browser-local test state.
// Local server mode stores one shared campaign-state JSON file.

(() => {
  const config = window.APP_CONFIG || {};
  const mode = config.storageMode || "local";

  const LOCAL_STORAGE_KEY = "mythicalBlueCampaignStateV1";
  const SEED_URL = "campaign/campaign-state.json";

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

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

  function createLocalAdapter() {
    async function loadSeed() {
      try {
        const response = await fetch(`${SEED_URL}?cacheBust=${Date.now()}`, {
          cache: "no-store"
        });

        if (!response.ok) return clone(DEFAULT_STATE);

        return normalizeState(await response.json());
      } catch {
        return clone(DEFAULT_STATE);
      }
    }

    return {
      async init() {
        if (!localStorage.getItem(LOCAL_STORAGE_KEY)) {
          localStorage.setItem(
            LOCAL_STORAGE_KEY,
            JSON.stringify(await loadSeed())
          );
        }
      },

      async loadCampaignState() {
        await this.init();

        return normalizeState(
          JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}")
        );
      },

      async saveCampaignState(state) {
        const normalized = normalizeState({
          ...state,
          updatedAt: new Date().toISOString()
        });

        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify(normalized)
        );

        return clone(normalized);
      },

      async resetTestData() {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        await this.init();

        return this.loadCampaignState();
      }
    };
  }

  function createApiAdapter() {
    return {
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
  }

  window.campaignStateStorage =
    mode === "api"
      ? createApiAdapter()
      : createLocalAdapter();
})();
