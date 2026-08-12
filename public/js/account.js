(() => {
  if (document.querySelector("[data-account-action]")) return;

  const icon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="10" r="3"></circle><path d="M7 20.7a6 6 0 0 1 10 0"></path></svg>';
  const button = document.createElement("button");
  button.type = "button";
  button.className = "account-action";
  button.dataset.accountAction = "";
  button.setAttribute("aria-label", "Open account settings");
  button.innerHTML = icon;

  const overlay = document.createElement("div");
  overlay.className = "account-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="account-panel" role="dialog" aria-modal="true" aria-labelledby="accountTitle">
      <div class="account-panel-header">
        <div>
          <h2 class="account-panel-title" id="accountTitle">Account</h2>
          <p class="account-panel-email" data-account-email>Loading...</p>
        </div>
        <button type="button" class="account-close" data-account-close aria-label="Close account settings">×</button>
      </div>
      <section class="account-preferences" aria-label="Display preferences">
        <div class="account-preference-row">
          <span>Theme</span>
          <button type="button" class="theme-toggle theme-toggle-compact account-theme-toggle" data-theme-toggle aria-label="Switch visual theme">
            <span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-orb"></span></span>
            <span class="theme-toggle-label">Moonlight</span>
          </button>
        </div>
        <div class="account-preference-row">
          <span>Text Size</span>
          <div class="accessibility-controls account-accessibility-controls" role="group" aria-label="Text size controls">
            <button type="button" class="accessibility-size-btn accessibility-decrease" data-size-action="decrease" aria-label="Decrease text size" title="Decrease text size">A−</button>
            <button type="button" class="accessibility-size-btn accessibility-reset" data-size-action="reset" aria-label="Reset text size" title="Reset text size">A</button>
            <button type="button" class="accessibility-size-btn accessibility-increase" data-size-action="increase" aria-label="Increase text size" title="Increase text size">A+</button>
          </div>
        </div>
      </section>
      <form data-account-form>
        <label class="account-field">Name<input type="text" name="name" autocomplete="name" /></label>
        <label class="account-field">Current Password<input type="password" name="currentPassword" autocomplete="current-password" /></label>
        <label class="account-field">New Password<input type="password" name="newPassword" autocomplete="new-password" /></label>
        <p class="account-help">Current password is only required when changing your password.</p>
        <p class="account-message" data-account-message role="alert" aria-live="polite"></p>
        <div class="account-actions">
          <button type="button" class="account-secondary" data-account-close>Cancel</button>
          <button type="submit" class="account-primary">Save</button>
        </div>
      </form>
    </section>`;

  document.body.append(button, overlay);

  const form = overlay.querySelector("[data-account-form]");
  const email = overlay.querySelector("[data-account-email]");
  const message = overlay.querySelector("[data-account-message]");
  const nameInput = form.elements.name;
  const currentPassword = form.elements.currentPassword;
  const newPassword = form.elements.newPassword;
  let loadedUser = null;

  function setMessage(text, success = false) {
    message.textContent = text;
    message.classList.toggle("success", success);
  }

  function close() {
    overlay.hidden = true;
    setMessage("");
    currentPassword.value = "";
    newPassword.value = "";
    button.focus();
  }

  async function loadUser() {
    const response = await fetch("/api/me", { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login");
      return null;
    }
    if (!response.ok) throw new Error("Could not load account.");
    loadedUser = await response.json();
    nameInput.value = loadedUser.name || "";
    email.textContent = loadedUser.email || "";
    return loadedUser;
  }

  async function open() {
    overlay.hidden = false;
    setMessage("");
    try {
      await loadUser();
      nameInput.focus();
    } catch (error) {
      console.error(error);
      setMessage("Could not load account.");
    }
  }

  button.addEventListener("click", open);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.querySelectorAll("[data-account-close]").forEach((closeButton) => closeButton.addEventListener("click", close));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) close(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    if (newPassword.value && !currentPassword.value) {
      setMessage("Enter your current password to set a new password.");
      currentPassword.focus();
      return;
    }

    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: nameInput.value, currentPassword: currentPassword.value, newPassword: newPassword.value })
      });
      if (response.redirected || response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Could not update account.");
      }
      loadedUser = await response.json();
      nameInput.value = loadedUser.name || "";
      currentPassword.value = "";
      newPassword.value = "";
      setMessage("Account updated.", true);
      if (typeof window.showToast === "function") {
        window.showToast("Account updated.", { variant: "success" });
      }
    } catch (error) {
      setMessage(error.message || "Could not update account.");
    }
  });
})();
