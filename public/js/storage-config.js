// Mythical Blue · environment-aware storage configuration
// GitHub Pages uses browser-local test data.
// Local server mode uses shared /api filesystem handlers.

(() => {
  const hostname = window.location.hostname;
  const existingConfig = window.APP_CONFIG || {};
  const isLocalTestEnvironment =
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".github.io");

  const storageMode =
    existingConfig.storageMode ||
    (isLocalTestEnvironment ? "local" : "api");

  window.APP_CONFIG = {
    ...existingConfig,
    storageMode,
    localStorageKey:
      existingConfig.localStorageKey || "mythicalBlueSheetTestCharactersV2",
    seedIndexUrl: existingConfig.seedIndexUrl || "characters/test-character-index.json"
  };
})();
