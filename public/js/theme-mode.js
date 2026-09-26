(() => {
  const STORAGE_KEY = 'mythicalBlueThemeMode';
  // Theme (Mythical Blue, Neutral, Raperonzolo) is separate from the daylight/moonlight mode.
  const STYLE_KEY = 'mythicalBlueThemeStyle';
  const STYLES = ['mythical-blue', 'neutral', 'raperonzolo'];
  const DEFAULT_STYLE = 'mythical-blue';
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

  function getStoredStyle() {
    try {
      const stored = localStorage.getItem(STYLE_KEY);
      return STYLES.includes(stored) ? stored : DEFAULT_STYLE;
    } catch {
      return DEFAULT_STYLE;
    }
  }

  function currentStyle() {
    const style = document.documentElement.dataset.style;
    return STYLES.includes(style) ? style : DEFAULT_STYLE;
  }

  // Neutral and Raperonzolo swap nautical wording for their own, using
  // data-text-*, data-placeholder-*, and data-empty-* attributes. Raperonzolo
  // falls back to the neutral wording when it has none of its own.
  function themedValue(element, kind, style) {
    if (style === DEFAULT_STYLE) return null;
    const own = element.getAttribute(`data-${kind}-${style}`);
    return own ?? element.getAttribute(`data-${kind}-neutral`);
  }

  function updateThemeText(style, scope = document) {
    const targets = { text: null, placeholder: 'placeholder', empty: 'data-empty' };
    Object.entries(targets).forEach(([kind, attribute]) => {
      const selector = `[data-${kind}-neutral], [data-${kind}-raperonzolo]`;
      const elements = [...(scope.matches?.(selector) ? [scope] : []), ...(scope.querySelectorAll?.(selector) || [])];
      elements.forEach(element => {
        const originalKey = `data-${kind}-original`;
        if (!element.hasAttribute(originalKey)) element.setAttribute(originalKey, attribute ? element.getAttribute(attribute) || '' : element.textContent);
        const value = themedValue(element, kind, style) ?? element.getAttribute(originalKey);
        if (attribute) element.setAttribute(attribute, value);
        else if (element.textContent !== value) element.textContent = value;
      });
    });
  }

  function updateImageAsset(img, mode) {
    if (!(img instanceof HTMLImageElement)) return;

    // Images with a non-nautical version (data-plain-*-src) use it outside Mythical Blue.
    const plain = currentStyle() !== DEFAULT_STYLE && img.dataset.plainDaylightSrc;
    const explicitDaylight = plain ? img.dataset.plainDaylightSrc : img.dataset.daylightSrc;
    const explicitMoonlight = plain ? img.dataset.plainMoonlightSrc || img.dataset.plainDaylightSrc : img.dataset.moonlightSrc;
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

  // Neutral and Raperonzolo hide the nautical title banner and show a text title after it instead.
  function updateThemeTitles(style) {
    document.querySelectorAll('img[src*="title-banner"], img[data-daylight-src*="title-banner"]').forEach(img => {
      let title = img.nextElementSibling;
      if (!title?.classList.contains('theme-title')) {
        title = document.createElement('div');
        title.className = 'theme-title';
        title.setAttribute('aria-hidden', 'true');
        img.after(title);
      }
      title.textContent = img.classList.contains('title-banner') ? 'Character Sheet' : 'Character Sheets';
    });
  }

  function updateStyleControls(style) {
    document.querySelectorAll('[data-theme-style-select]').forEach(select => {
      if (select.value !== style) select.value = style;
    });
  }

  function applyStyle(style) {
    const normalized = STYLES.includes(style) ? style : DEFAULT_STYLE;
    document.documentElement.dataset.style = normalized;
    updateThemeText(normalized);
    updateThemeTitles(normalized);
    updateThemeAssets(currentTheme());
    updateStyleControls(normalized);
    try { localStorage.setItem(STYLE_KEY, normalized); } catch {}
  }

  // Lets scripts pick wording for text they build themselves.
  window.themeText = (mythicalBlue, other) => currentStyle() === DEFAULT_STYLE ? mythicalBlue : other;

  function toggleTheme() {
    applyTheme(currentTheme() === MOONLIGHT ? DAYLIGHT : MOONLIGHT);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.style = getStoredStyle();
    applyTheme(getStoredTheme());
    applyStyle(getStoredStyle());
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', toggleTheme);
    });
    document.querySelectorAll('[data-theme-style-select]').forEach((select) => {
      select.addEventListener('change', () => applyStyle(select.value));
    });

    const observer = new MutationObserver((mutations) => {
      const mode = currentTheme();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          updateThemeAssets(mode, node);
          if (currentStyle() !== DEFAULT_STYLE) updateThemeText(currentStyle(), node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) applyTheme(getStoredTheme());
    if (event.key === STYLE_KEY) applyStyle(getStoredStyle());
  });
})();
