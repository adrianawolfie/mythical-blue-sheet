(() => {
  const API_BASE_URL = "https://raperonzolo.com";

  window.apiFetch = (path, options = {}) => fetch(new URL(path, API_BASE_URL), {
    ...options,
    credentials: "include"
  });
})();
