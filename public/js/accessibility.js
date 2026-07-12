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
  const baselineFontSizes = new WeakMap();
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

      // Scale every local app stylesheet automatically. This deliberately
      // avoids a hand-maintained allowlist so future UI additions inherit the
      // Aa controls as soon as their CSS is included. The accessibility pill
      // itself remains a fixed-size control.
      const isLocalAppStylesheet =
        href.includes("/css/") &&
        !href.includes("/css/accessibility.css");

      if (!isLocalAppStylesheet) return;

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

      if (!baselineFontSizes.has(rule)) {
        baselineFontSizes.set(rule, Number(match[1]));
      }

      scalableRules.push({
        rule,
        originalPixels: baselineFontSizes.get(rule)
      });
    });
  }

  function refreshScalableRules() {
    collectScalableRules();
    applyFontScale();
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

    // Future dynamically inserted stylesheets can opt into the same scaling
    // behavior without changing this file.
    window.refreshAccessibilityFontScaling = refreshScalableRules;

    new MutationObserver(mutations => {
      if (mutations.some(mutation =>
        Array.from(mutation.addedNodes || []).some(node =>
          node.nodeType === 1 &&
          (node.matches?.('link[rel="stylesheet"], style') ||
            node.querySelector?.('link[rel="stylesheet"], style'))
        )
      )) {
        refreshScalableRules();
      }
    }).observe(document.head, { childList: true, subtree: true });
  });
})();
