(() => {
  const body = document.getElementById("adminUsersBody");
  const modal = document.getElementById("editUserModal");
  const form = document.getElementById("editUserForm");
  const nameInput = document.getElementById("editUserName");
  const emailInput = document.getElementById("editUserEmail");
  const passwordInput = document.getElementById("editUserPassword");
  const adminInput = document.getElementById("editUserAdmin");
  const enabledInput = document.getElementById("editUserEnabled");
  const error = document.getElementById("editUserError");
  let editingUserId = "";

  function cell(text, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text || "";
    return td;
  }

  function closeModal() {
    modal.hidden = true;
    editingUserId = "";
    error.textContent = "";
    form.reset();
  }

  function openModal(user) {
    editingUserId = user.ID;
    nameInput.value = user.Name || "";
    emailInput.value = user.Email || "";
    passwordInput.value = "";
    adminInput.checked = Boolean(user.IsAdmin);
    enabledInput.checked = Boolean(user.Enabled);
    error.textContent = "";
    modal.hidden = false;
    nameInput.focus();
  }

  async function load() {
    const response = await fetch("/api/admin/users", { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login.html");
      return;
    }
    if (response.status === 403) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="5">Forbidden.</td></tr>';
      return;
    }
    if (!response.ok) throw new Error("Could not load users.");
    const data = await response.json();

    body.textContent = "";

    if (!data.Users?.length) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="5">No registered users found.</td></tr>';
      return;
    }

    data.Users.forEach((user) => {
      const tr = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.className = "admin-break";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "admin-inline-action";
      edit.textContent = user.Name || user.Email;
      edit.addEventListener("click", () => openModal(user));
      nameCell.appendChild(edit);
      tr.append(nameCell, cell(user.Email, "admin-break"), cell(user.ID, "admin-mono"));
      const adminCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = user.IsAdmin ? "admin-badge admin-badge-on" : "admin-badge";
      badge.textContent = user.IsAdmin ? "Yes" : "No";
      adminCell.appendChild(badge);
      tr.appendChild(adminCell);
      const statusCell = document.createElement("td");
      const status = document.createElement("button");
      status.type = "button";
      status.className = user.Enabled ? "admin-badge admin-badge-on admin-status-toggle" : "admin-badge admin-status-toggle";
      status.textContent = user.Enabled ? "Enabled" : "Disabled";
      status.addEventListener("click", async () => {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(user.ID)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: user.Name, email: user.Email, isAdmin: user.IsAdmin, enabled: !user.Enabled })
        });
        if (!response.ok) {
          alert((await response.text()) || "Could not update user status.");
          return;
        }
        await load();
      });
      statusCell.appendChild(status);
      tr.appendChild(statusCell);
      body.appendChild(tr);
    });
  }

  document.querySelector("[data-edit-user-cancel]")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const response = await fetch(`/api/admin/users/${encodeURIComponent(editingUserId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.value, email: emailInput.value, password: passwordInput.value, isAdmin: adminInput.checked, enabled: enabledInput.checked })
    });
    if (!response.ok) {
      error.textContent = (await response.text()) || "Could not update user.";
      return;
    }
    closeModal();
    await load();
    if (typeof window.showToast === "function") {
      window.showToast("User updated.", { variant: "success" });
    }
  });

  load().catch((error) => {
    console.error(error);
    body.innerHTML = '<tr><td class="admin-empty" colspan="5">Could not load users.</td></tr>';
  });
})();
