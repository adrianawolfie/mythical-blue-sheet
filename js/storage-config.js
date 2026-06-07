// Mythical Blue · environment-aware storage configuration
// GitHub Pages and local previews use browser-local test data.
// Netlify production uses shared Netlify Functions.

(() => {
  const hostname = window.location.hostname;
  const isLocalTestEnvironment =
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".github.io");

  window.APP_CONFIG = {
    storageMode: isLocalTestEnvironment ? "local" : "netlify",
    localStorageKey: "mythicalBlueSheetTestCharactersV2",
    seedIndexUrl: "characters/test-character-index.json"
  };
})();
