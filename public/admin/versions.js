(() => {
  const body = document.getElementById("adminVersionsBody");
  const name = document.getElementById("versionCharacterName");
  const count = document.getElementById("versionCount");
  const currentLink = document.getElementById("openCurrentCharacter");
  const characterId = new URLSearchParams(window.location.search).get("id")?.trim() || "";

  function showMessage(message) {
    body.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "admin-empty";
    cell.colSpan = 4;
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function renderVersions(versions) {
    body.replaceChildren();
    if (!versions.length) {
      showMessage("No saved versions found.");
      return;
    }
    [...versions].reverse().forEach((version, index) => {
      const row = document.createElement("tr");
      const savedAt = document.createElement("td");
      const time = document.createElement("time");
      time.dateTime = version.UpdatedAt;
      const parsed = new Date(version.UpdatedAt);
      time.textContent = Number.isNaN(parsed.getTime()) ? version.UpdatedAt : parsed.toLocaleString();
      savedAt.appendChild(time);

      const id = document.createElement("td");
      id.className = "admin-mono admin-break";
      id.textContent = version.VersionID;

      const state = document.createElement("td");
      state.textContent = index === 0 ? "Current" : "Previous";

      const preview = document.createElement("td");
      const link = document.createElement("a");
      link.className = "admin-inline-action";
      link.href = `/character.html?id=${encodeURIComponent(characterId)}&version=${encodeURIComponent(version.VersionID)}`;
      link.textContent = "Preview";
      preview.appendChild(link);

      row.append(savedAt, id, state, preview);
      body.appendChild(row);
    });
  }

  async function load() {
    if (!characterId) {
      name.textContent = "Unknown character";
      showMessage("A character ID is required.");
      return;
    }
    const response = await fetch(`/api/admin/characters/${encodeURIComponent(characterId)}/history`, { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login.html");
      return;
    }
    if (response.status === 403) {
      showMessage("Forbidden.");
      return;
    }
    if (response.status === 404) {
      showMessage("Character not found.");
      return;
    }
    if (!response.ok) throw new Error("Could not load character versions.");

    const data = await response.json();
    name.textContent = data.Character?.Name || "Unnamed Character";
    count.textContent = String(data.VersionCount || 0);
    currentLink.href = `/character.html?id=${encodeURIComponent(data.Character?.ID || characterId)}`;
    currentLink.hidden = false;
    renderVersions(data.Versions || []);
  }

  load().catch(error => {
    console.error(error);
    showMessage(error.message || "Could not load character versions.");
  });
})();
