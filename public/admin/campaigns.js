(() => {
  const body = document.getElementById("adminCampaignsBody");

  function textEl(tag, text, className = "") {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text || "";
    return el;
  }

  function renderPlayers(cell, campaign) {
    const list = document.createElement("div");
    list.className = "admin-player-list";
    if (!campaign.Players?.length) {
      list.appendChild(textEl("span", "No players", "admin-muted"));
    } else {
      campaign.Players.forEach((player) => {
        const chip = document.createElement("span");
        chip.className = "admin-player-chip";
        chip.appendChild(textEl("span", player.Name));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "admin-player-remove";
        remove.dataset.campaignId = campaign.ID;
        remove.dataset.userId = player.ID;
        remove.setAttribute("aria-label", `Remove ${player.Name}`);
        remove.textContent = "×";
        chip.appendChild(remove);
        list.appendChild(chip);
      });
    }
    cell.appendChild(list);

    const addWrap = document.createElement("div");
    addWrap.className = "admin-player-add";
    const show = document.createElement("button");
    show.type = "button";
    show.dataset.campaignShowPlayerPicker = campaign.ID;
    show.textContent = "+ Add Player";
    addWrap.appendChild(show);

    const picker = document.createElement("div");
    picker.className = "admin-player-picker";
    picker.dataset.campaignPlayerPicker = campaign.ID;
    picker.hidden = true;
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Player to add");
    select.dataset.campaignPlayerSelect = campaign.ID;
    if (!campaign.AvailableUsers?.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No users available";
      select.appendChild(option);
    } else {
      campaign.AvailableUsers.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.ID;
        option.textContent = user.Name || user.Email;
        select.appendChild(option);
      });
    }
    const add = document.createElement("button");
    add.type = "button";
    add.dataset.campaignAddPlayer = campaign.ID;
    add.textContent = "Add";
    picker.append(select, add);
    addWrap.appendChild(picker);
    cell.appendChild(addWrap);
  }

  function renderCampaigns(campaigns) {
    body.textContent = "";
    if (!campaigns.length) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="5">No campaigns found.</td></tr>';
      return;
    }
    campaigns.forEach((campaign) => {
      const tr = document.createElement("tr");
      const nameCell = document.createElement("td");
      const link = document.createElement("a");
      link.className = "admin-inline-action";
      link.href = "/dm-screen.html";
      link.textContent = campaign.Name;
      nameCell.append(link, document.createElement("br"), textEl("small", campaign.ID, "admin-campaign-id admin-mono"));
      tr.appendChild(nameCell);
      tr.appendChild(textEl("td", campaign.Calendar));
      tr.appendChild(textEl("td", String(campaign.DaysTraveled)));
      const playersCell = document.createElement("td");
      renderPlayers(playersCell, campaign);
      tr.appendChild(playersCell);
      tr.appendChild(textEl("td", campaign.UpdatedAt));
      body.appendChild(tr);
    });
  }

  async function load() {
    const response = await fetch("/api/admin/campaigns", { headers: { Accept: "application/json" } });
    if (response.redirected || response.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (response.status === 403) {
      body.innerHTML = '<tr><td class="admin-empty" colspan="5">Forbidden.</td></tr>';
      return;
    }
    if (!response.ok) throw new Error("Could not load campaigns.");
    const data = await response.json();
    renderCampaigns(data.Campaigns || []);
  }

  document.addEventListener("click", async (event) => {
    const showPicker = event.target.closest("[data-campaign-show-player-picker]");
    const add = event.target.closest("[data-campaign-add-player]");
    const remove = event.target.closest(".admin-player-remove");
    try {
      if (showPicker) {
        const campaignId = showPicker.dataset.campaignShowPlayerPicker;
        const picker = document.querySelector(`[data-campaign-player-picker="${CSS.escape(campaignId)}"]`);
        if (picker) picker.hidden = !picker.hidden;
      }
      if (add) {
        const campaignId = add.dataset.campaignAddPlayer;
        const select = document.querySelector(`[data-campaign-player-select="${CSS.escape(campaignId)}"]`);
        const userId = select ? select.value : "";
        if (!userId) return;
        const response = await fetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId })
        });
        if (!response.ok) throw new Error("Failed to add player.");
        await load();
      }
      if (remove) {
        const campaignId = remove.dataset.campaignId;
        const userId = remove.dataset.userId;
        const response = await fetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/players/${encodeURIComponent(userId)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Failed to remove player.");
        await load();
      }
    } catch (error) {
      alert(error.message || "Could not update campaign players.");
    }
  });

  load().catch((error) => {
    console.error(error);
    body.innerHTML = '<tr><td class="admin-empty" colspan="5">Could not load campaigns.</td></tr>';
  });
})();
