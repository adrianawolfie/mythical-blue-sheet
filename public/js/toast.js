(() => {
  let activeToast = null;
  let activeTimer = null;

  function getContainer() {
    let container = document.getElementById("toastContainer");
    if (container) return container;

    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
    return container;
  }

  function removeToast(toast) {
    if (!toast) return;
    toast.remove();
    if (activeToast === toast) {
      activeToast = null;
    }
  }

  function showToast(message, options = {}) {
    const variant = options.variant === "error" ? "error" : "success";
    const duration = Number.isFinite(options.duration) ? options.duration : 3000;
    const container = getContainer();
    const toast = document.createElement("div");

    toast.textContent = message;
    toast.className = `toast-message toast-${variant}`;

    if (activeToast) {
      removeToast(activeToast);
    }
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }

    container.appendChild(toast);
    activeToast = toast;

    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    activeTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => {
        removeToast(toast);
      }, 180);
    }, duration);

    return toast;
  }

  window.showToast = showToast;
})();
