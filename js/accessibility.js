(() => {
  const STORAGE_KEY = "mythicalBlueFontScaleV2";
  const LEGACY_STORAGE_KEYS = [
    "mythicalBlueFontScale",
    "mythicalBluePageScale"
  ];

  const FONT_SCALE_LEVELS = [0.9, 1, 1.1, 1.2, 1.3];
  const DEFAULT_INDEX = 1;
  const BASE_ROOT_FONT_SIZE = 16;
  const MOBILE_QUERY = "(max-width: 768px)";

  const scalableRules = [];
  let currentIndex = getStoredScaleIndex();

  function getStoredScaleIndex() {
    const storedScale = Number(localStorage.getItem(STORAGE_KEY));
    const index = FONT_SCALE_LEVELS.indexOf(storedScale);
    return index >= 0 ? index : DEFAULT_INDEX;
  }

  function clearLegacyScaling() {
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));

    document.documentElement.style.removeProperty("--app-font-scale");
    document.documentElement.style.removeProperty("--app-page-scale");
    document.body?.style.removeProperty("zoom");
  }

  function collectScalableRules() {
    scalableRules.length = 0;

    Array.from(document.styleSheets).forEach(styleSheet => {
      const href = styleSheet.href || "";

      // Scale the main character-sheet stylesheet and the calendar stylesheet.
      // styles.css is now an import-only entry point, so imported CSS files
      // must also be traversed recursively.
      const isScalableStylesheet =
        href.includes("/css/styles.css") ||
        href.includes("/css/calendar.css");

      if (!isScalableStylesheet) return;

      collectFromStyleSheet(styleSheet);
    });
  }

  function collectFromStyleSheet(styleSheet) {
    let rules;

    try {
      rules = styleSheet.cssRules;
    } catch {
      return;
    }

    collectFromRuleList(rules);
  }

  function collectFromRuleList(rules) {
    Array.from(rules || []).forEach(rule => {
      // CSS @import rules expose their imported stylesheet through
      // rule.styleSheet rather than rule.cssRules.
      if (rule.styleSheet) {
        collectFromStyleSheet(rule.styleSheet);
      }

      if (rule.cssRules) {
        collectFromRuleList(rule.cssRules);
      }

      const fontSize = rule.style?.fontSize || "";
      const match = fontSize.match(/^([0-9]*\.?[0-9]+)px$/);

      if (!match) return;

      scalableRules.push({
        rule,
        originalPixels: Number(match[1])
      });
    });
  }

  function applyFontScale() {
    const scale = FONT_SCALE_LEVELS[currentIndex];

    document.documentElement.style.fontSize =
      `${BASE_ROOT_FONT_SIZE * scale}px`;

    scalableRules.forEach(({ rule, originalPixels }) => {
      rule.style.fontSize = `${originalPixels * scale}px`;
    });

    localStorage.setItem(STORAGE_KEY, String(scale));

    document.querySelectorAll(".accessibility-size-btn").forEach(button => {
      button.setAttribute(
        "aria-pressed",
        button.dataset.sizeAction === "reset" && scale === 1
          ? "true"
          : "false"
      );
    });
  }

  function changeFontScale(action) {
    if (action === "decrease") {
      currentIndex = Math.max(0, currentIndex - 1);
    } else if (action === "increase") {
      currentIndex = Math.min(FONT_SCALE_LEVELS.length - 1, currentIndex + 1);
    } else {
      currentIndex = DEFAULT_INDEX;
    }

    applyFontScale();
  }

  function syncPopoutState() {
    const isMobile = window.matchMedia(MOBILE_QUERY).matches;

    document.querySelectorAll(".accessibility-controls").forEach(control => {
      if (!isMobile) {
        control.classList.add("open");
      } else {
        control.classList.remove("open");
      }

      control.querySelector(".accessibility-toggle")?.setAttribute(
        "aria-expanded",
        String(!isMobile)
      );
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    clearLegacyScaling();
    collectScalableRules();
    syncPopoutState();

    document.querySelectorAll(".accessibility-toggle").forEach(toggle => {
      toggle.addEventListener("click", () => {
        const control = toggle.closest(".accessibility-controls");
        if (!control) return;

        // Desktop remains expanded. Mobile uses a compact pop-out.
        if (!window.matchMedia(MOBILE_QUERY).matches) return;

        const isOpen = control.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
    });

    document.querySelectorAll(".accessibility-size-btn").forEach(button => {
      button.addEventListener("click", () => {
        changeFontScale(button.dataset.sizeAction);
      });
    });

    window.matchMedia(MOBILE_QUERY).addEventListener?.("change", syncPopoutState);

    applyFontScale();
  });
})();
