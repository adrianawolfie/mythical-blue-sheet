(() => {
  const campaignsEl = document.getElementById("homeCampaigns");
  const charactersEl = document.getElementById("homeCharacters");

  async function fetchJSON(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.assign("/login.html");
      return null;
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  function clear(el) {
    while (el.firstChild) {
      el.firstChild.remove();
    }
  }

  function addMeta(parent, text) {
    const item = document.createElement("span");
    item.textContent = text;
    parent.appendChild(item);
  }

  function calendarLabel(date) {
    if (!date) return "Calendar unknown";
    if (date.special) return `Year ${date.year}, ${date.special}`;
    if (!date.month || !date.day) return `Year ${date.year}`;
    return `Year ${date.year}, Month ${date.month}, Day ${date.day}`;
  }

  function renderCampaigns(campaigns, currentUser) {
    clear(campaignsEl);
    if (!campaigns.length) {
      campaignsEl.appendChild(emptyMessage("No campaigns are assigned to your account yet."));
      return;
    }

    campaigns.forEach((campaign) => {
      const isDM = campaign.dm && currentUser.id && campaign.dm === currentUser.id;
      const card = document.createElement(isDM ? "a" : "article");
      card.className = "home-card";
      if (isDM) {
        card.href = "dm-screen.html";
      }

      const title = document.createElement("span");
      title.className = "home-card-title";
      title.textContent = campaign.name || campaign.id || "Untitled Campaign";
      card.appendChild(title);

      const meta = document.createElement("span");
      meta.className = "home-card-meta";
      addMeta(meta, calendarLabel(campaign.calendarDate));
      addMeta(meta, `Days traveled: ${campaign.daysTraveled || 0}`);
      if (isDM) {
        addMeta(meta, "DM tools available");
      }
      card.appendChild(meta);

      campaignsEl.appendChild(card);
    });
  }

  function renderCharacters(characters) {
    clear(charactersEl);
    if (!characters.length) {
      charactersEl.appendChild(emptyMessage("No characters are assigned to your account yet."));
      return;
    }

    characters.forEach((character) => {
      const card = document.createElement("a");
      card.className = "home-card";
      card.href = `/character.html?id=${encodeURIComponent(character.id)}`;

      const title = document.createElement("span");
      title.className = "home-card-title";
      title.textContent = character.name || "Unnamed Character";
      card.appendChild(title);

      const meta = document.createElement("span");
      meta.className = "home-card-meta";
      if (character.hpCurrent || character.hpMax) {
        addMeta(meta, `HP: ${character.hpCurrent || "0"}/${character.hpMax || "0"}`);
      }
      if (character.armorClass) {
        addMeta(meta, `AC: ${character.armorClass}`);
      }
      if (character.currentConditions) {
        addMeta(meta, `Conditions: ${character.currentConditions}`);
      }
      if (!meta.children.length) {
        addMeta(meta, "Open character sheet");
      }
      card.appendChild(meta);

      charactersEl.appendChild(card);
    });
  }

  function emptyMessage(message) {
    const el = document.createElement("p");
    el.className = "home-muted";
    el.textContent = message;
    return el;
  }

  async function init() {
    try {
      const [campaigns, characters] = await Promise.all([
        fetchJSON("/api/campaigns?owned=1"),
        fetchJSON("/api/characters?owned=1")
      ]);
      if (!campaigns || !characters) return;
      const currentUser = await fetchJSON("/api/me");
      if (!currentUser) return;
      renderCampaigns(campaigns, currentUser);
      renderCharacters(characters);
    } catch (error) {
      console.error(error);
      clear(campaignsEl);
      clear(charactersEl);
      campaignsEl.appendChild(emptyMessage("Could not load campaigns."));
      charactersEl.appendChild(emptyMessage("Could not load characters."));
    }
  }

  init();
})();
