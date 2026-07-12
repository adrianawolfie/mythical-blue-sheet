(() => {
  const STORAGE_KEY = 'mythicalBlueThemeMode';
  const DAYLIGHT = 'daylight';
  const MOONLIGHT = 'moonlight';
  const THEME_ICON_MAP = [
    { daylight: 'assets/equipment-icons/', moonlight: 'assets/themes/moonlight/equipment-icons/' },
    { daylight: 'assets/spell-icons/', moonlight: 'assets/themes/moonlight/spell-icons/' }
  ];

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === MOONLIGHT ? MOONLIGHT : DAYLIGHT;
    } catch {
      return DAYLIGHT;
    }
  }

  function setStoredTheme(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === MOONLIGHT ? MOONLIGHT : DAYLIGHT;
  }

  function moonlightAssetPath(src = '') {
    if (!src) return src;
    const normalized = daylightAssetPath(src);
    const mapping = THEME_ICON_MAP.find(item => normalized.includes(item.daylight));
    return mapping ? normalized.replace(mapping.daylight, mapping.moonlight) : normalized;
  }

  function daylightAssetPath(src = '') {
    if (!src) return src;
    const mapping = THEME_ICON_MAP.find(item => src.includes(item.moonlight));
    return mapping ? src.replace(mapping.moonlight, mapping.daylight) : src;
  }

  function isThemeIconAsset(src = '') {
    return THEME_ICON_MAP.some(item => src.includes(item.daylight) || src.includes(item.moonlight));
  }

  function updateImageAsset(img, mode) {
    if (!(img instanceof HTMLImageElement)) return;

    const explicitDaylight = img.dataset.daylightSrc;
    const explicitMoonlight = img.dataset.moonlightSrc;
    const currentSrc = img.getAttribute('src') || '';

    if (explicitDaylight && explicitMoonlight) {
      const desired = mode === MOONLIGHT ? explicitMoonlight : explicitDaylight;
      if (desired && currentSrc !== desired) img.setAttribute('src', desired);
      return;
    }

    if (!isThemeIconAsset(currentSrc)) return;

    const daylight = img.dataset.themeDaylightSrc || daylightAssetPath(currentSrc);
    const moonlight = img.dataset.themeMoonlightSrc || moonlightAssetPath(daylight);
    img.dataset.themeDaylightSrc = daylight;
    img.dataset.themeMoonlightSrc = moonlight;

    const desired = mode === MOONLIGHT ? moonlight : daylight;
    if (desired && currentSrc !== desired) img.setAttribute('src', desired);
  }

  function updateThemeAssets(mode, scope = document) {
    if (scope instanceof HTMLImageElement) updateImageAsset(scope, mode);
    scope.querySelectorAll?.('img').forEach(img => updateImageAsset(img, mode));
  }

  function updateToggleButtons(mode) {
    const isMoonlight = mode === MOONLIGHT;
    const nextMode = isMoonlight ? DAYLIGHT : MOONLIGHT;
    const label = nextMode === MOONLIGHT ? 'Moonlight Mode' : 'Daylight Mode';
    const shortLabel = nextMode === MOONLIGHT ? 'Moonlight' : 'Daylight';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const labelNode = button.querySelector('.theme-toggle-label');
      if (labelNode) labelNode.textContent = button.classList.contains('theme-toggle-compact') ? shortLabel : label;
      button.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
      button.setAttribute('title', `Switch to ${label.toLowerCase()}`);
      button.setAttribute('aria-pressed', isMoonlight ? 'true' : 'false');
      button.dataset.nextTheme = nextMode;
    });
  }

  function applyTheme(mode) {
    const normalized = mode === MOONLIGHT ? MOONLIGHT : DAYLIGHT;
    document.documentElement.dataset.theme = normalized;
    updateThemeAssets(normalized);
    updateToggleButtons(normalized);
    setStoredTheme(normalized);
  }

  function toggleTheme() {
    applyTheme(currentTheme() === MOONLIGHT ? DAYLIGHT : MOONLIGHT);
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getStoredTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', toggleTheme);
    });

    const observer = new MutationObserver((mutations) => {
      const mode = currentTheme();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) updateThemeAssets(mode, node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) applyTheme(getStoredTheme());
  });
})();
