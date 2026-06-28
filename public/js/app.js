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

  bindUnsavedCharacterWarning();
  document.getElementById("addExtraSpeedBtn")?.addEventListener("click", () => {
    addExtraSpeedRow();
  });

  document.getElementById("backToStartBtn").addEventListener("click", async () => {
    if (!confirmDiscardUnsavedCharacterChanges("return to the character list")) return;
    currentCharacterId = null;
    loadedCharacterUpdatedAt = null;
    markCharacterClean();
    showStartPage();
    await renderCharacterList();
  });

  try {
    await characterStorage.init();

    const resetButton = document.getElementById("resetTestDataBtn");
    if (characterStorage.canReset && resetButton) {
      resetButton.style.display = "inline-block";
      resetButton.addEventListener("click", async () => {
        if (!confirmDiscardUnsavedCharacterChanges("reset the test data")) return;
        if (!confirm("Reset local test data to the repository seed characters?")) return;
        await characterStorage.resetTestData();
        currentCharacterId = null;
        loadedCharacterUpdatedAt = null;
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
