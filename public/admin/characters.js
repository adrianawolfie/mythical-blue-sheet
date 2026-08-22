(() => {
  const body = document.getElementById("adminCharactersBody");
  const modal = document.getElementById("assignCharacterModal");
  const form = document.getElementById("assignCharacterForm");
  const name = document.getElementById("assignCharacterName");
  const user = document.getElementById("assignCharacterUser");
  const error = document.getElementById("assignCharacterError");
  const trashIcon = '<svg class="admin-action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><path d="M19 6l-1 14c0 1-1 2-2 2H8c-1 0-2-1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
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
    const unassigned = document.createElement("option");
    unassigned.value = "";
    unassigned.textContent = "Unassigned";
    user.appendChild(unassigned);
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
      body.innerHTML = '<tr><td class="admin-empty" colspan="5">No saved characters found.</td></tr>';
      return;
    }

    characters.forEach((character) => {
      const tr = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.className = "admin-break";
      const link = document.createElement("a");
      link.className = "admin-inline-action";
      link.href = `/character.html?id=${encodeURIComponent(character.ID)}`;
      link.textContent = character.Name;
      nameCell.appendChild(link);
      const versionsCell = document.createElement("td");
      const versionsLink = document.createElement("a");
      versionsLink.className = "admin-inline-action";
      versionsLink.href = `/admin/versions.html?id=${encodeURIComponent(character.ID)}`;
      versionsLink.textContent = "View versions";
      versionsCell.appendChild(versionsLink);
      tr.append(nameCell, cell(character.Class), cell(character.Level), versionsCell);
      const userCell = document.createElement("td");
      userCell.className = "admin-break";
      const actions = document.createElement("div");
      actions.className = "admin-action-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-inline-action";
      button.dataset.assignCharacterId = character.ID;
      button.dataset.assignCharacterName = character.Name;
      button.dataset.assignUserId = character.UserID || "";
      button.textContent = character.UserName;
      button.addEventListener("click", () => openModal(button));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-danger-action";
      remove.setAttribute("aria-label", `Delete ${character.Name}`);
      remove.title = "Delete character";
      remove.innerHTML = trashIcon;
      remove.addEventListener("click", async () => {
        if (!confirm(`Delete ${character.Name}?`)) return;
        const response = await fetch(`/api/admin/characters/${encodeURIComponent(character.ID)}`, { method: "DELETE" });
        if (!response.ok) {
          alert("Could not delete character.");
          return;
        }
        await load();
      });
      actions.append(button, remove);
      userCell.appendChild(actions);
      tr.appendChild(userCell);
      body.appendChild(tr);
    });
  }

  async function load() {
    const response = await fetch("/api/admin/characters", { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login.html");
      return;
    }
    if (response.status === 403) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="5">Forbidden.</td></tr>';
      return;
    }
    if (!response.ok) throw new Error("Could not load characters.");
    const data = await response.json();

    renderUsers(data.Users || []);
    renderCharacters(data.Characters || []);
  }

  document.querySelector("[data-assign-cancel]")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const assigned = Boolean(user.value);

    const response = await fetch(`/api/admin/characters/${encodeURIComponent(characterId)}/assignment`, {
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
      window.showToast(assigned ? "Character assigned." : "Character unassigned.", { variant: "success" });
    }
  });

  load().catch((err) => {
    console.error(err);
    body.innerHTML = '<tr><td class="admin-empty" colspan="5">Could not load characters.</td></tr>';
  });
})();
