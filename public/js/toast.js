(() => {
  let activeToast = null;
  let activeTimer = null;

  const variants = {
    success: {
      background: "rgba(20, 83, 45, 0.96)",
      color: "#ecfdf5",
      border: "1px solid rgba(167, 243, 208, 0.28)"
    },
    error: {
      background: "rgba(127, 29, 29, 0.96)",
      color: "#fef2f2",
      border: "1px solid rgba(254, 202, 202, 0.34)"
    }
  };

  function getContainer() {
    let container = document.getElementById("toastContainer");
    if (container) return container;

    container = document.createElement("div");
    container.id = "toastContainer";
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.zIndex = "9999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "flex-end";
    container.style.gap = "8px";
    container.style.pointerEvents = "none";
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
    const variant = variants[options.variant] || variants.success;
    const duration = Number.isFinite(options.duration) ? options.duration : 3000;
    const container = getContainer();
    const toast = document.createElement("div");

    toast.textContent = message;
    toast.style.maxWidth = "320px";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "10px";
    toast.style.background = variant.background;
    toast.style.color = variant.color;
    toast.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.24)";
    toast.style.border = variant.border;
    toast.style.font = "600 14px/1.3 system-ui, sans-serif";
    toast.style.letterSpacing = "0.01em";
    toast.style.pointerEvents = "none";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = "opacity 160ms ease, transform 160ms ease";

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
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    activeTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      setTimeout(() => {
        removeToast(toast);
      }, 180);
    }, duration);

    return toast;
  }

  window.showToast = showToast;
})();
