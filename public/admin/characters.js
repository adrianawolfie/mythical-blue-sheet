(() => {
  const currentUser = document.getElementById("adminCurrentUser");
  const count = document.getElementById("adminCharacterCount");
  const body = document.getElementById("adminCharactersBody");
  const modal = document.getElementById("assignCharacterModal");
  const form = document.getElementById("assignCharacterForm");
  const name = document.getElementById("assignCharacterName");
  const user = document.getElementById("assignCharacterUser");
  const error = document.getElementById("assignCharacterError");
  let characterId = "";

  function closeModal() {
    modal.hidden = true;
    characterId = "";
    error.textContent = "";
  }

  function cell(text, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text || "";
    return td;
  }

  function renderUsers(users) {
    user.textContent = "";
    users.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.ID;
      option.textContent = item.Name || item.Email;
      user.appendChild(option);
    });
  }

  function openModal(button) {
    characterId = button.dataset.assignCharacterId;
    name.textContent = button.dataset.assignCharacterName;
    if (button.dataset.assignUserId) {
      user.value = button.dataset.assignUserId;
    } else {
      user.selectedIndex = 0;
    }
    error.textContent = "";
    modal.hidden = false;
    user.focus();
  }

  function renderCharacters(characters) {
    body.textContent = "";
    if (!characters.length) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="4">No saved characters found.</td></tr>';
      return;
    }

    characters.forEach((character) => {
      const tr = document.createElement("tr");
      tr.append(cell(character.Name, "admin-break"), cell(character.Class), cell(character.Level));
      const userCell = document.createElement("td");
      userCell.className = "admin-break";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-inline-action";
      button.dataset.assignCharacterId = character.ID;
      button.dataset.assignCharacterName = character.Name;
      button.dataset.assignUserId = character.UserID || "";
      button.textContent = character.UserName;
      button.addEventListener("click", () => openModal(button));
      userCell.appendChild(button);
      tr.appendChild(userCell);
      body.appendChild(tr);
    });
  }

  async function load() {
    const response = await fetch("/api/admin/characters", { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (response.status === 403) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="4">Forbidden.</td></tr>';
      return;
    }
    if (!response.ok) throw new Error("Could not load characters.");
    const data = await response.json();

    currentUser.textContent = data.CurrentUser.Email;
    count.textContent = String(data.Count || 0);
    renderUsers(data.Users || []);
    renderCharacters(data.Characters || []);
  }

  document.querySelector("[data-assign-cancel]")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";

    const response = await fetch(`/admin/characters/${encodeURIComponent(characterId)}/assignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.value })
    });
    if (!response.ok) {
      error.textContent = "Could not assign character.";
      return;
    }
    closeModal();
    await load();
    if (typeof window.showToast === "function") {
      window.showToast("Character assigned.", { variant: "success" });
    }
  });

  load().catch((err) => {
    console.error(err);
    body.innerHTML = '<tr><td class="admin-empty" colspan="4">Could not load characters.</td></tr>';
  });
})();
