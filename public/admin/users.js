(() => {
  const currentUser = document.getElementById("adminCurrentUser");
  const count = document.getElementById("adminUserCount");
  const body = document.getElementById("adminUsersBody");

  function cell(text, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text || "";
    return td;
  }

  async function load() {
    const response = await fetch("/api/admin/users", { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (response.status === 403) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="4">Forbidden.</td></tr>';
      return;
    }
    if (!response.ok) throw new Error("Could not load users.");
    const data = await response.json();

    currentUser.textContent = data.CurrentUser.Email;
    count.textContent = String(data.UserCount || 0);
    body.textContent = "";

    if (!data.Users?.length) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="4">No registered users found.</td></tr>';
      return;
    }

    data.Users.forEach((user) => {
      const tr = document.createElement("tr");
      tr.append(cell(user.Name, "admin-break"), cell(user.Email, "admin-break"), cell(user.ID, "admin-mono"));
      const adminCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = user.IsAdmin ? "admin-badge admin-badge-on" : "admin-badge";
      badge.textContent = user.IsAdmin ? "Yes" : "No";
      adminCell.appendChild(badge);
      tr.appendChild(adminCell);
      body.appendChild(tr);
    });
  }

  load().catch((error) => {
    console.error(error);
    body.innerHTML = '<tr><td class="admin-empty" colspan="4">Could not load users.</td></tr>';
  });
})();
