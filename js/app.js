// Mythical Blue · App initialization
// Main startup and event binding.

document.addEventListener("DOMContentLoaded", async () => {
  populateConditionDropdown();
  showStartPage();
  renderSelectedConditions();
  renderFeatureEntries("featList", []);
  renderProficiencyRows();
  renderArmorClassState();
  bindArmorClassControls();
  bindInventoryControls();

  document.getElementById("newCharacterBtn").addEventListener("click", newCharacter);
  document.getElementById("saveCharacterBtn").addEventListener("click", saveCurrentCharacter);
  document.getElementById("deleteCharacterBtn").addEventListener("click", deleteCurrentCharacter);
  document.getElementById("addExtraSpeedBtn")?.addEventListener("click", () => {
    addExtraSpeedRow();
  });

  document.getElementById("backToStartBtn").addEventListener("click", async () => {
    currentCharacterId = null;
    loadedCharacterUpdatedAt = null;
    showStartPage();
    await renderCharacterList();
  });

  try {
    await characterStorage.init();

    const resetButton = document.getElementById("resetTestDataBtn");
    if (characterStorage.canReset && resetButton) {
      resetButton.style.display = "inline-block";
      resetButton.addEventListener("click", async () => {
        if (!confirm("Reset local test data to the repository seed characters?")) return;
        await characterStorage.resetTestData();
        currentCharacterId = null;
        loadedCharacterUpdatedAt = null;
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
