// Mythical Blue · App initialization
// Main startup and event binding.

function bindUnsavedCharacterWarning() {
  const sheet = document.querySelector(".sheet");
  if (sheet && !sheet.dataset.unsavedWarningBound) {
    sheet.dataset.unsavedWarningBound = "true";

    sheet.addEventListener("input", () => markCharacterDirty(), true);
    sheet.addEventListener("change", () => markCharacterDirty(), true);
    sheet.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !sheet.contains(button)) return;
      if (button.classList.contains("tab")) return;
      if (button.closest(".accessibility-controls")) return;
      if (button.matches("[data-theme-toggle], .theme-toggle")) return;
      markCharacterDirty();
    }, true);
  }

  if (!window.__mythicalBlueUnsavedWarningBound) {
    window.__mythicalBlueUnsavedWarningBound = true;
    window.addEventListener("beforeunload", (event) => {
      if (!hasUnsavedCharacterChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const pageURL = new URL(window.location.href);
  const saved = pageURL.searchParams.get("saved");
  if (saved === "character" || saved === "restored") {
    showSaveToast(saved === "restored" ? "Character version restored" : "Character saved");
    pageURL.searchParams.delete("saved");
    window.history.replaceState(null, "", `${pageURL.pathname}${pageURL.search}${pageURL.hash}`);
  }
  populateConditionDropdown();
  showStartPage();
  renderSelectedConditions();
  renderFeatureEntries("featList", []);
  renderProficiencyRows();
  renderDefenseRows();
  renderArmorClassState();
  bindArmorClassControls();
  bindInventoryControls();

  document.getElementById("newCharacterBtn").addEventListener("click", () => {
    if (!confirmDiscardUnsavedCharacterChanges("start a new character")) return;
    newCharacter();
  });
  document.getElementById("saveCharacterBtn").addEventListener("click", () => saveCurrentCharacter(true));
  document.getElementById("deleteCharacterBtn").addEventListener("click", deleteCurrentCharacter);
  document.getElementById("copyCharacterBtn").addEventListener("click", copyCurrentCharacter);

  bindUnsavedCharacterWarning();
  document.getElementById("addExtraSpeedBtn")?.addEventListener("click", () => {
    addExtraSpeedRow();
  });

  document.getElementById("backToStartBtn").addEventListener("click", async () => {
    if (document.body.classList.contains("character-detail-page")) {
      window.location.href = "/characters.html";
      return;
    }
    if (!confirmDiscardUnsavedCharacterChanges("return to the character list")) return;
    currentCharacterId = null;
    loadedCharacterUpdatedAt = null;
    loadedCharacterLiveUpdatedAt = null;
    markCharacterClean();
    showStartPage();
    await renderCharacterList();
  });

  try {
    await characterStorage.init();

    const resetButton = document.getElementById("resetTestDataBtn");
    if (characterStorage.canReset && resetButton) {
      resetButton.classList.add("is-visible");
      resetButton.addEventListener("click", async () => {
        if (!confirmDiscardUnsavedCharacterChanges("reset the test data")) return;
        if (!confirm("Reset local test data to the repository seed characters?")) return;
        await characterStorage.resetTestData();
        currentCharacterId = null;
        loadedCharacterUpdatedAt = null;
        loadedCharacterLiveUpdatedAt = null;
        markCharacterClean();
        showStartPage();
        await renderCharacterList();
        alert("Local test data reset.");
      });
    }

    await renderCharacterList();
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not initialize character storage.");
  }
});

// ─── HP TRACKER LOGIC ────────────────────────────────────────────────────────
