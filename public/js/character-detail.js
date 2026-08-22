// Query-driven character detail page bootstrap.

if (window.characterStorage) {
  window.characterStorage.listCharacterData = async () => [];
}

function showCharacterDetailError(message) {
  const error = document.getElementById("characterDetailError");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function configureCharacterVersionControls(id, previousVersion, viewingVersion) {
  const undoForm = document.getElementById("undoCharacterForm");
  const currentForm = document.getElementById("currentCharacterForm");
  const preview = document.getElementById("characterVersionPreview");

  if (undoForm) {
    undoForm.querySelector('[name="id"]').value = id;
    const versionButton = undoForm.querySelector('[name="version"]');
    versionButton.value = previousVersion || "";
    undoForm.hidden = !previousVersion;
  }
  if (currentForm) {
    currentForm.querySelector('[name="id"]').value = id;
    currentForm.hidden = !viewingVersion;
  }
  if (preview) preview.hidden = !viewingVersion;
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id")?.trim() || "";
  const selectedVersion = params.get("version")?.trim() || "";
  if (!id) {
    showCharacterDetailError("A character ID is required.");
    return;
  }

  try {
    const [current, history] = await Promise.all([
      characterStorage.loadCharacterData(id),
      characterStorage.loadCharacterHistory(id)
    ]);

    let character = current;
    let previousVersion = "";
    if (selectedVersion) {
      const selectedIndex = history.findIndex(version => version.versionId === selectedVersion);
      if (selectedIndex < 0) throw new Error("Character version not found.");

      character = await characterStorage.loadCharacterVersion(id, selectedVersion);
      character.live = current.live;
      if (character.live?.hpOverride == null) {
        character.live.hpMax = character.summary?.hpMax ?? character.fields?.hpMax ?? "";
      }
      character.updatedAt = current.updatedAt;
      if (selectedIndex > 0) previousVersion = history[selectedIndex - 1].versionId;
    } else {
      const currentIndex = history.findIndex(version => version.updatedAt === current.updatedAt);
      if (currentIndex > 0) previousVersion = history[currentIndex - 1].versionId;
    }

    configureCharacterVersionControls(id, previousVersion, selectedVersion !== "");
    loadCharacter(character);
    document.getElementById("startPage")?.style.setProperty("display", "none", "important");
  } catch (error) {
    console.error(error);
    showCharacterDetailError(error.message || "Could not load character.");
  }
});
