// Mythical Blue · Party inventory
// Inventory sub-page with the campaign's shared party stash (purse, containers,
// party items, and loot to claim) plus party-wide summaries built from every
// party member's sheet.

(() => {
  const PAGE_KEY = "mythicalBlueInventoryPage";
  const COINS = [["cp", "copperPieces", 0.01], ["sp", "silverPieces", 0.1], ["ep", "electrumPieces", 0.5], ["gp", "goldPieces", 1], ["pp", "platinumPieces", 10]];
  const HEALING_POTION = /potion of (?:greater |superior |supreme )?healing|healing potion/i;
  const CONSUMABLE_NAME = /potion|elixir|philter|oil of|scroll|antitoxin|healer.?s kit|rations?\b|arrows?\b|bolts?\b|bullets?\b|needles?\b|ammunition|torch|caltrops|ball bearings|holy water|alchemist.?s fire|acid \(vial\)/i;
  const STASH_TYPES = [...INVENTORY_ITEM_TYPE_OPTIONS.slice(0, -1), { value: "valuable", label: "Gem / Valuable" }, INVENTORY_ITEM_TYPE_OPTIONS[INVENTORY_ITEM_TYPE_OPTIONS.length - 1]];
  const POLL_DELAY = 30000;

  const party = {
    key: "",
    campaignId: "",
    campaignName: "",
    members: [],
    stash: null,
    stashAvailable: true,
    loading: false,
    error: "",
    search: "",
    open: new Set(),
    saveTimer: 0,
    saving: false,
    saveAgain: false,
    status: "",
    pollTimer: 0,
    overviewFrame: 0
  };

  const esc = inventorySafeValue;
  const root = () => document.getElementById("partyInventoryPage");

  function newId(prefix) {
    return inventoryId(prefix).replace(/[^A-Za-z0-9_-]/g, "");
  }

  function quantity(value) {
    const text = String(value ?? "").replace(/,/g, "").trim();
    if (!text) return 1;
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 1;
  }

  function coinsInGold(coins = {}) {
    return COINS.reduce((sum, [key, , perGold]) => sum + (Number.parseFloat(String(coins[key] || "").replace(/,/g, "")) || 0) * perGold, 0);
  }

  function itemsValue(items) {
    return items.reduce((sum, item) => sum + (parseGoldValue(item.value) || 0) * quantity(item.qty), 0);
  }

  function formatQty(value) {
    return Number(value.toFixed(2)).toLocaleString();
  }

  // ── Party data ─────────────────────────────────────────────────────────

  function locationName(member, location) {
    if (!location) return "Unassigned";
    if (location === "worn") return "Equipped & Carried";
    return member.containers.find(container => container.id === location)?.name || "Other storage";
  }

  function memberFromCharacter(character, listing = {}) {
    const lists = character.customLists || {};
    const fields = character.fields || {};
    return {
      id: character.id,
      name: character.summary?.name || fields.characterName || listing.name || "Unnamed Character",
      detail: [listing.species, listing.class, listing.level ? `Level ${listing.level}` : ""].filter(Boolean).join(" · "),
      isCurrent: false,
      coins: Object.fromEntries(COINS.map(([key, field]) => [key, fields[field] || ""])),
      items: mergeLegacyInventoryRows({
        inventoryItems: lists.inventoryItems,
        equipment: lists.inventoryEquipment,
        magicItems: lists.magicItems,
        consumables: lists.consumables
      }).map(item => normalizeInventoryItem(item, item.type)).filter(item => item.name),
      gems: (lists.gems || []).filter(gem => gem.name || gem.value),
      containers: (lists.storageLocations || []).map(normalizeStorageLocation)
    };
  }

  // The open sheet may have unsaved edits, so the current character is read from the page.
  function currentMember(listing = {}) {
    return {
      id: currentCharacterId,
      name: getFieldValue("characterName") || listing.name || "Unnamed Character",
      detail: [listing.species, listing.class, listing.level ? `Level ${listing.level}` : ""].filter(Boolean).join(" · "),
      isCurrent: true,
      coins: Object.fromEntries(COINS.map(([key, field]) => [key, getFieldValue(field)])),
      items: collectUnifiedInventoryRows().filter(item => item.name),
      gems: collectInventoryGemRows().filter(gem => gem.name || gem.value),
      containers: collectStorageLocations()
    };
  }

  function memberName(id) {
    if (!id) return "";
    return party.members.find(member => member.id === id)?.name || "Former member";
  }

  function emptyStash() {
    return { campaignId: party.campaignId, coins: { cp: "", sp: "", ep: "", gp: "", pp: "" }, containers: [], items: [], updatedAt: "" };
  }

  async function loadStash() {
    try {
      const response = await window.apiFetch(`/api/party-inventory?campaignId=${encodeURIComponent(party.campaignId)}&cacheBust=${Date.now()}`, { cache: "no-store" });
      if (response.status === 404 || response.status === 405) {
        party.stashAvailable = false;
        party.stash = party.stash || emptyStash();
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load the party stash.");
      party.stashAvailable = true;
      party.stash = {
        ...emptyStash(),
        ...body,
        coins: { ...emptyStash().coins, ...(body.coins || {}) },
        containers: Array.isArray(body.containers) ? body.containers : [],
        items: Array.isArray(body.items) ? body.items : []
      };
    } catch (error) {
      console.warn(error);
      party.stashAvailable = false;
      party.stash = party.stash || emptyStash();
    }
  }

  async function loadParty({ force = false } = {}) {
    const key = `${currentCharacterId || ""}|${currentCharacterCampaignId || ""}`;
    if (!force && party.key === key && party.members.length) {
      refreshCurrentMember();
      render();
      return;
    }

    party.key = key;
    party.campaignId = currentCharacterCampaignId || "";
    party.members = [];
    party.stash = null;
    party.error = "";
    party.open.clear();
    if (!party.campaignId) {
      render();
      return;
    }

    party.loading = true;
    render();
    try {
      const [listings, campaigns] = await Promise.all([
        // The character page stubs out characterStorage.listCharacterData, so ask the API directly.
        window.apiFetch(`/api/characters?cacheBust=${Date.now()}`, { cache: "no-store" }).then(response => {
          if (!response.ok) throw new Error("Could not load the party’s characters.");
          return response.json();
        }),
        window.apiFetch(`/api/campaigns?cacheBust=${Date.now()}`, { cache: "no-store" }).then(response => response.ok ? response.json() : []).catch(() => [])
      ]);
      party.campaignName = (Array.isArray(campaigns) ? campaigns : []).find(campaign => campaign.id === party.campaignId)?.name || "";
      const partyListings = (Array.isArray(listings) ? listings : []).filter(listing => listing.campaignId === party.campaignId);
      const members = await Promise.all(partyListings.map(async listing => {
        if (listing.id === currentCharacterId) return currentMember(listing);
        try {
          return memberFromCharacter(await characterStorage.loadCharacterData(listing.id), listing);
        } catch (error) {
          console.warn(error);
          return null;
        }
      }));
      party.members = members.filter(Boolean);
      if (!party.members.some(member => member.isCurrent)) party.members.unshift(currentMember());
      party.members.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
      await loadStash();
    } catch (error) {
      console.error(error);
      party.error = error.message || "Could not load the party.";
    } finally {
      party.loading = false;
      render();
      schedulePoll();
    }
  }

  function refreshCurrentMember() {
    const index = party.members.findIndex(member => member.isCurrent);
    if (index >= 0) party.members[index] = { ...currentMember(), detail: party.members[index].detail };
  }

  // ── Saving the stash ───────────────────────────────────────────────────

  function setStatus(text) {
    party.status = text;
    const status = document.getElementById("partyStashStatus");
    if (status) status.textContent = text;
  }

  function scheduleSave(delay = 700) {
    if (!party.stashAvailable || !party.stash) return;
    clearTimeout(party.saveTimer);
    setStatus("Unsaved changes…");
    party.saveTimer = setTimeout(saveStash, delay);
  }

  async function saveStash() {
    clearTimeout(party.saveTimer);
    if (party.saving) {
      party.saveAgain = true;
      return;
    }
    party.saving = true;
    setStatus("Saving…");
    try {
      const response = await window.apiFetch("/api/party-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...party.stash, campaignId: party.campaignId, expectedUpdatedAt: party.stash.updatedAt || "" })
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await loadStash();
        renderStash();
        scheduleOverview();
        setStatus("Reloaded");
        window.showToast?.("Someone else changed the party stash at the same time. It was reloaded with their changes, so check that your last edit is still there.", { type: "error" });
        return;
      }
      if (!response.ok) throw new Error(body.error || "Could not save the party stash.");
      party.stash.updatedAt = body.updatedAt || party.stash.updatedAt;
      setStatus("Saved");
    } catch (error) {
      console.error(error);
      setStatus("Not saved – check your connection");
    } finally {
      party.saving = false;
      if (party.saveAgain) {
        party.saveAgain = false;
        saveStash();
      }
    }
  }

  function schedulePoll() {
    clearTimeout(party.pollTimer);
    party.pollTimer = setTimeout(async () => {
      const page = root();
      const busy = party.saving || party.saveTimer && party.status === "Unsaved changes…" || document.activeElement?.closest?.("#partyStash");
      if (page && !page.hidden && !document.hidden && party.campaignId && party.stashAvailable && !busy) {
        const before = party.stash?.updatedAt;
        await loadStash();
        if (party.stash?.updatedAt !== before) {
          renderStash();
          scheduleOverview();
        }
      }
      if (party.campaignId) schedulePoll();
    }, POLL_DELAY);
  }

  // ── Summaries ──────────────────────────────────────────────────────────

  // Every item the party holds, with who holds it and where.
  function holdings() {
    const list = [];
    party.members.forEach(member => {
      member.items.forEach(item => list.push({ item, owner: member.name, ownerId: member.id, where: locationName(member, item.location) }));
    });
    (party.stash?.items || []).forEach(item => {
      const container = party.stash.containers.find(entry => entry.id === item.container)?.name;
      const owner = item.category === "loot" && item.claimedBy ? `Loot · ${memberName(item.claimedBy)}` : "Party stash";
      list.push({ item, owner, ownerId: "", where: [item.category === "loot" ? (item.claimedBy ? "Claimed loot" : "Unclaimed loot") : "Party item", container].filter(Boolean).join(" · ") });
    });
    return list;
  }

  function groupByName(entries) {
    const groups = new Map();
    entries.forEach(entry => {
      const key = entry.item.name.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { name: entry.item.name.trim(), rarity: entry.item.rarity, total: 0, owners: new Map() });
      const group = groups.get(key);
      const qty = quantity(entry.item.qty);
      group.total += qty;
      group.owners.set(entry.owner, (group.owners.get(entry.owner) || 0) + qty);
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function ownerChips(owners) {
    return `<span class="party-owner-chips">${[...owners].map(([owner, qty]) => `<span>${esc(owner)} <b>×${formatQty(qty)}</b></span>`).join("")}</span>`;
  }

  function wealthRows() {
    const rows = party.members.map(member => {
      const coins = coinsInGold(member.coins);
      const valuables = itemsValue(member.gems);
      const gear = itemsValue(member.items);
      return { name: member.isCurrent ? `${member.name} (you)` : member.name, coins, valuables, gear, total: coins + valuables + gear };
    });
    if (party.stash) {
      const stashItems = party.stash.items;
      const coins = coinsInGold(party.stash.coins);
      const valuables = itemsValue(stashItems.filter(item => item.type === "valuable"));
      const gear = itemsValue(stashItems.filter(item => item.type !== "valuable"));
      rows.push({ name: "Party stash", coins, valuables, gear, total: coins + valuables + gear, stash: true });
    }
    return rows;
  }

  function renderGlance() {
    const rows = wealthRows();
    const sum = key => rows.reduce((total, row) => total + row[key], 0);
    const healing = groupByName(holdings().filter(entry => HEALING_POTION.test(entry.item.name)));
    const healingTotal = healing.reduce((total, group) => total + group.total, 0);
    const healingOwners = new Map();
    healing.forEach(group => group.owners.forEach((qty, owner) => healingOwners.set(owner, (healingOwners.get(owner) || 0) + qty)));
    const unclaimed = (party.stash?.items || []).filter(item => item.category === "loot" && !item.claimedBy);
    const tile = (label, value, detail = "", extra = "") => `<div class="party-tile${extra}"><span>${label}</span><strong>${value}</strong>${detail ? `<em>${detail}</em>` : ""}</div>`;

    return [
      tile("Party wealth", formatGold(sum("total")), `${party.members.length} member${party.members.length === 1 ? "" : "s"} + stash`, " party-tile-main"),
      tile("Coins", formatGold(sum("coins")), party.stash ? `Party purse ${formatGold(coinsInGold(party.stash.coins))}` : ""),
      tile("Gems & valuables", formatGold(sum("valuables"))),
      tile("Gear value", formatGold(sum("gear")), "Items with a listed value"),
      tile("Healing potions", formatQty(healingTotal), healingOwners.size ? [...healingOwners].map(([owner, qty]) => `${esc(owner)} ${formatQty(qty)}`).join(" · ") : "None in the party"),
      tile("Unclaimed loot", formatQty(unclaimed.reduce((total, item) => total + quantity(item.qty), 0)), unclaimed.length ? formatGold(itemsValue(unclaimed)) : "Nothing waiting")
    ].join("");
  }

  function renderWealth() {
    const rows = wealthRows();
    const total = key => formatGold(rows.reduce((sum, row) => sum + row[key], 0));
    return `
      <div class="sb-hdr">Wealth by Member</div>
      <div class="party-table-wrap">
        <table class="party-wealth-table">
          <thead><tr><th>Member</th><th>Coins</th><th>Valuables</th><th>Gear</th><th>Total</th></tr></thead>
          <tbody>${rows.map(row => `<tr${row.stash ? ' class="is-stash"' : ""}><th scope="row">${esc(row.name)}</th><td>${formatGold(row.coins)}</td><td>${formatGold(row.valuables)}</td><td>${formatGold(row.gear)}</td><td><strong>${formatGold(row.total)}</strong></td></tr>`).join("")}</tbody>
          <tfoot><tr><th scope="row">Party</th><td>${total("coins")}</td><td>${total("valuables")}</td><td>${total("gear")}</td><td><strong>${total("total")}</strong></td></tr></tfoot>
        </table>
      </div>
      <p class="party-note">Gear counts items with a value, times their quantity. Plain numbers are read as gold.</p>`;
  }

  function renderFinderResults() {
    const query = party.search.trim().toLowerCase();
    const entries = holdings().filter(entry => query
      ? [entry.item.name, entry.item.type, entry.item.rarity, entry.owner, entry.where].join(" ").toLowerCase().includes(query)
      : entry.item.type === "consumable" || CONSUMABLE_NAME.test(entry.item.name));
    const groups = groupByName(entries).sort((a, b) => Number(HEALING_POTION.test(b.name)) - Number(HEALING_POTION.test(a.name)) || a.name.localeCompare(b.name));
    if (!groups.length) return `<p class="party-empty">${query ? "Nobody in the party has anything matching that." : "No potions, scrolls, ammunition, or other consumables in the party yet."}</p>`;
    return groups.map(group => `<div class="party-find-row"><span class="party-find-name inventory-entry-name" data-rarity-name="${inventoryRarityKey(group.rarity)}">${esc(group.name)}</span><span class="party-find-total">×${formatQty(group.total)}</span>${ownerChips(group.owners)}</div>`).join("");
  }

  function renderFinder() {
    return `
      <div class="sb-hdr">Find Across the Party</div>
      <label class="party-search"><span>Search every inventory</span><input id="partySearchInput" type="search" placeholder="Rope, potion, scroll, Bag of Holding…" value="${esc(party.search)}"></label>
      <div class="party-find-caption">${party.search.trim() ? "Matching items" : "Potions & consumables"}</div>
      <div id="partyFindResults" class="party-find-list">${renderFinderResults()}</div>`;
  }

  function renderMagic() {
    const magic = holdings().filter(entry => entry.item.type === "magic" || normalizeInventoryRarity(entry.item.rarity));
    const order = rarity => INVENTORY_RARITIES.indexOf(normalizeInventoryRarity(rarity));
    magic.sort((a, b) => order(b.item.rarity) - order(a.item.rarity) || a.item.name.localeCompare(b.item.name));
    return `
      <div class="sb-hdr">Magic Items</div>
      <div class="party-magic-list">${magic.length ? magic.map(entry => `<div class="party-magic-row"><span class="party-find-name inventory-entry-name" data-rarity-name="${inventoryRarityKey(entry.item.rarity)}">${esc(entry.item.name)}${quantity(entry.item.qty) > 1 ? ` ×${formatQty(quantity(entry.item.qty))}` : ""}</span><em>${esc(normalizeInventoryRarity(entry.item.rarity) || "Magic item")}</em><span class="party-magic-owner">${esc(entry.owner)}</span></div>`).join("") : '<p class="party-empty">No magic items in the party yet.</p>'}</div>`;
  }

  function renderMembers() {
    return `
      <div class="sb-hdr">Members' Inventories</div>
      <div class="party-members-list">${party.members.map(member => {
        const groups = new Map();
        member.items.forEach(item => {
          const where = locationName(member, item.location);
          if (!groups.has(where)) groups.set(where, []);
          groups.get(where).push(item);
        });
        const wealth = coinsInGold(member.coins) + itemsValue(member.gems) + itemsValue(member.items);
        return `<details class="party-member">
          <summary><span class="party-member-name">${esc(member.name)}${member.isCurrent ? " <em>(you)</em>" : ""}</span><span class="party-member-meta">${esc(member.detail)}</span><span class="party-member-worth">${member.items.length} item${member.items.length === 1 ? "" : "s"} · ${formatGold(wealth)}</span></summary>
          <div class="party-member-body">
            <p class="party-member-coins">${COINS.map(([key]) => `${esc(member.coins[key] || "0")} ${key}`).join(" · ")}${member.gems.length ? ` · ${member.gems.length} valuable${member.gems.length === 1 ? "" : "s"} (${formatGold(itemsValue(member.gems))})` : ""}</p>
            ${groups.size ? [...groups].map(([where, items]) => `<div class="party-member-group"><div class="party-find-caption">${esc(where)}</div>${items.map(item => `<div class="party-member-item"><span class="inventory-entry-name" data-rarity-name="${inventoryRarityKey(item.rarity)}">${esc(item.name)}</span><span>${quantity(item.qty) !== 1 ? `×${formatQty(quantity(item.qty))}` : ""}</span><span>${esc(item.value)}</span></div>`).join("")}</div>`).join("") : '<p class="party-empty">No items.</p>'}
          </div>
        </details>`;
      }).join("")}</div>`;
  }

  function renderOverview() {
    party.overviewFrame = 0;
    const glance = document.getElementById("partyGlance");
    if (!glance) return;
    glance.innerHTML = renderGlance();
    document.getElementById("partyWealth").innerHTML = renderWealth();
    const results = document.getElementById("partyFindResults");
    if (results) results.innerHTML = renderFinderResults();
    document.getElementById("partyMagic").innerHTML = renderMagic();
    const members = document.getElementById("partyMembers");
    const openMembers = new Set([...members.querySelectorAll("details[open] .party-member-name")].map(element => element.textContent));
    members.innerHTML = renderMembers();
    members.querySelectorAll("details").forEach(details => { if (openMembers.has(details.querySelector(".party-member-name").textContent)) details.open = true; });
  }

  function scheduleOverview() {
    if (!party.overviewFrame) party.overviewFrame = requestAnimationFrame(renderOverview);
  }

  // ── Party stash editor ─────────────────────────────────────────────────

  function memberOptions(selected, emptyLabel) {
    const options = [`<option value="">${esc(emptyLabel)}</option>`, ...party.members.map(member => `<option value="${esc(member.id)}"${member.id === selected ? " selected" : ""}>${esc(member.name)}${member.isCurrent ? " (you)" : ""}</option>`)];
    if (selected && !party.members.some(member => member.id === selected)) options.push(`<option value="${esc(selected)}" selected>Former member</option>`);
    return options.join("");
  }

  function itemMeta(item) {
    const container = party.stash.containers.find(entry => entry.id === item.container)?.name;
    const type = STASH_TYPES.find(option => option.value === item.type)?.label;
    return [type, normalizeInventoryRarity(item.rarity), container ? `in ${container}` : "", item.category === "loot" && item.claimedBy ? `claimed by ${memberName(item.claimedBy)}` : ""].filter(Boolean).join(" · ");
  }

  function quickAction(item) {
    if (item.category !== "loot") return "";
    if (!item.claimedBy) return '<button type="button" class="party-quick" data-party-action="claim">Claim</button>';
    if (item.claimedBy === currentCharacterId) return '<button type="button" class="party-quick is-mine" data-party-action="take">Take</button>';
    return "";
  }

  function stashItemRow(item) {
    const open = party.open.has(item.id);
    return `<div class="inventory-entry party-entry${open ? " is-open" : ""}" data-party-item="${esc(item.id)}" data-rarity="${inventoryRarityKey(item.rarity)}">
      <div class="inventory-entry-summary" data-party-toggle>
        <button type="button" class="inventory-entry-open" aria-expanded="${open}"><span class="inventory-entry-name">${esc(item.name || "New item")}</span><span class="inventory-entry-meta">${esc(itemMeta(item))}</span></button>
        ${quickAction(item)}
        <span class="inventory-entry-qty">${item.qty ? `×${esc(item.qty)}` : ""}</span>
        <span class="inventory-entry-value">${esc(item.value)}</span>
        <span class="inventory-entry-chevron" aria-hidden="true">⌄</span>
      </div>
      <div class="inventory-entry-editor party-entry-editor"${open ? "" : " hidden"}>
        <label class="inventory-entry-field party-field-wide"><span>Item</span><input data-party-field="name" value="${esc(item.name)}" placeholder="Item name…"></label>
        <label class="inventory-entry-field"><span>Belongs to</span><select data-party-field="category"><option value="loot"${item.category === "loot" ? " selected" : ""}>Loot (to divide)</option><option value="party"${item.category !== "loot" ? " selected" : ""}>The whole party</option></select></label>
        <label class="inventory-entry-field"><span>Claimed by</span><select data-party-field="claimedBy"${item.category === "loot" ? "" : " disabled"}>${memberOptions(item.claimedBy, "Unclaimed")}</select></label>
        <label class="inventory-entry-field"><span>Type</span><select data-party-field="type">${STASH_TYPES.map(option => `<option value="${option.value}"${option.value === (item.type || "gear") ? " selected" : ""}>${esc(option.label)}</option>`).join("")}</select></label>
        <label class="inventory-entry-field"><span>Rarity</span><select data-party-field="rarity">${inventoryRarityOptions(item.rarity)}</select></label>
        <label class="inventory-entry-field"><span>Qty</span><input data-party-field="qty" inputmode="numeric" value="${esc(item.qty)}" placeholder="1"></label>
        <label class="inventory-entry-field"><span>Value</span><input data-party-field="value" value="${esc(item.value)}" placeholder="—"></label>
        <label class="inventory-entry-field party-field-wide"><span>Container</span><select data-party-field="container"><option value="">Not in a container</option>${party.stash.containers.map(container => `<option value="${esc(container.id)}"${container.id === item.container ? " selected" : ""}>${esc(container.name || "Unnamed container")}</option>`).join("")}</select></label>
        <label class="inventory-entry-field inventory-entry-field-details"><span>Notes</span><textarea data-party-field="notes" placeholder="Description, where it was found, who wants it…">${inventorySafeText(item.notes)}</textarea></label>
        <div class="inventory-entry-actions">
          <button type="button" class="party-take" data-party-action="take">Take into my inventory</button>
          <button type="button" class="inventory-entry-remove" data-party-action="remove">Remove item</button>
        </div>
      </div>
    </div>`;
  }

  function stashGroup(title, items, empty, hint = "") {
    return `<div class="party-stash-group">
      <div class="party-subhdr">${title}<em>${items.length ? `${formatQty(items.reduce((sum, item) => sum + quantity(item.qty), 0))} · ${formatGold(itemsValue(items))}` : ""}</em></div>
      ${hint ? `<p class="party-note">${hint}</p>` : ""}
      <div class="inventory-entry-list party-entry-list" data-empty="${esc(empty)}">${items.map(stashItemRow).join("")}</div>
    </div>`;
  }

  function renderStash() {
    const box = document.getElementById("partyStash");
    if (!box) return;
    if (!party.stash) {
      box.innerHTML = "";
      return;
    }
    const stash = party.stash;
    const items = stash.items;
    const purse = coinsInGold(stash.coins);
    const members = party.members.length || 1;
    box.innerHTML = `
      <div class="sb-hdr party-stash-hdr">Party Stash <span id="partyStashStatus" class="party-status" aria-live="polite">${esc(party.status)}</span></div>
      ${party.stashAvailable ? "" : '<p class="party-notice">The shared party stash is not available on this server yet, so changes here can’t be saved. The summaries above still work.</p>'}
      <div class="party-stash-actions">
        <button type="button" class="inventory-add" data-party-action="add-loot">+ Add Loot</button>
        <button type="button" class="inventory-add" data-party-action="add-party">+ Add Party Item</button>
        <button type="button" class="inventory-add" data-party-action="add-library">+ From Item Library</button>
      </div>
      ${stashGroup("Unclaimed Loot", items.filter(item => item.category === "loot" && !item.claimedBy), "No unclaimed loot. Add treasure here after a fight, then claim what you want.")}
      ${stashGroup("Claimed Loot", items.filter(item => item.category === "loot" && item.claimedBy), "Nothing claimed yet.", "Claimed loot stays in the stash until its owner presses Take.")}
      ${stashGroup("Party Items", items.filter(item => item.category !== "loot"), "No shared party items yet, such as a tent, cart, or ship's supplies.")}
      <div class="party-stash-group">
        <div class="party-subhdr">Party Purse<em>${formatGold(purse)}</em></div>
        <div class="coinsrow party-purse">${COINS.map(([key]) => `<div class="cbox2${key === "gp" ? " gold-coin" : ""}"><label>${key.toUpperCase()}</label><input type="text" inputmode="decimal" placeholder="0" data-party-coin="${key}" value="${esc(stash.coins[key])}"></div>`).join("")}</div>
        <p class="party-note party-split">${purse ? `Split ${members} way${members === 1 ? "" : "s"}: ${formatGold(Math.floor(purse / members * 100) / 100)} each` : ""}</p>
      </div>
      <div class="party-stash-group">
        <div class="party-subhdr">Containers<em>${stash.containers.length || ""}</em></div>
        <div class="party-container-list" data-empty="No containers yet. Add a bag of holding, cart, or ship's hold, then put stash items in it.">${stash.containers.map(container => `<div class="party-container-row" data-party-container="${esc(container.id)}">
          <label class="inventory-entry-field"><span>Container</span><input data-container-field="name" value="${esc(container.name)}" placeholder="Bag of Holding"></label>
          <label class="inventory-entry-field"><span>Carried by</span><select data-container-field="carriedBy">${memberOptions(container.carriedBy, "Nobody / left behind")}</select></label>
          <label class="inventory-entry-field"><span>Notes</span><input data-container-field="notes" value="${esc(container.notes)}" placeholder="Where it is, capacity…"></label>
          <button type="button" class="party-container-remove" data-party-action="remove-container" aria-label="Remove container">×</button>
        </div>`).join("")}</div>
        <button type="button" class="inventory-add" data-party-action="add-container">+ Add Container</button>
      </div>`;
  }

  function renderPage() {
    const page = root();
    if (!page) return;
    if (!currentCharacterId) {
      page.innerHTML = '<p class="party-empty">Open a character to see their party.</p>';
      return;
    }
    if (!party.campaignId) {
      page.innerHTML = '<div class="sb-card party-message"><div class="sb-hdr">Party Inventory</div><p>This character isn’t in a campaign yet. Once an admin adds them to a campaign, the party’s shared stash and totals appear here.</p></div>';
      return;
    }
    if (party.loading) {
      page.innerHTML = '<div class="sb-card party-message"><div class="sb-hdr">Party Inventory</div><p>Gathering the party’s packs…</p></div>';
      return;
    }
    if (party.error) {
      page.innerHTML = `<div class="sb-card party-message"><div class="sb-hdr">Party Inventory</div><p>${esc(party.error)}</p><button type="button" class="inventory-add" data-party-action="refresh">Try again</button></div>`;
      return;
    }
    page.innerHTML = `
      <div class="party-toolbar">
        <div><div class="party-title">${esc(party.campaignName || "Your party")}</div><div class="party-subtitle">${party.members.map(member => esc(member.name)).join(" · ")}</div></div>
        <button type="button" class="inventory-add" data-party-action="refresh">↻ Refresh</button>
      </div>
      <div id="partyGlance" class="party-glance"></div>
      <div class="party-grid">
        <section id="partyWealth" class="sb-card party-wealth-card"></section>
        <section class="sb-card party-finder-card">${renderFinder()}</section>
        <section id="partyStash" class="sb-card party-stash-card"></section>
        <section id="partyMembers" class="sb-card party-members-card"></section>
        <section id="partyMagic" class="sb-card party-magic-card"></section>
      </div>`;
    renderStash();
    renderOverview();
  }

  function render() {
    renderPage();
  }

  // ── Stash actions ──────────────────────────────────────────────────────

  function findItem(element) {
    const id = element.closest("[data-party-item]")?.dataset.partyItem;
    return party.stash?.items.find(item => item.id === id) || null;
  }

  function addStashItem(data = {}, category = "loot") {
    if (!party.stash) return;
    const item = {
      id: newId("party-item"),
      name: String(data.name || ""),
      category,
      type: normalizeInventoryType(data.type || "gear"),
      rarity: normalizeInventoryRarity(data.rarity),
      qty: String(data.qty || ""),
      value: String(data.value || ""),
      container: "",
      claimedBy: "",
      notes: String(data.details || data.notes || "")
    };
    party.stash.items.push(item);
    if (!item.name) party.open.add(item.id);
    renderStash();
    scheduleOverview();
    if (item.name) scheduleSave(); else document.querySelector(`[data-party-item="${item.id}"] [data-party-field="name"]`)?.focus();
  }

  function takeItem(item) {
    if (!item || !currentCharacterId) return;
    if (item.type === "valuable") addInventoryGemRow({ name: item.name, qty: item.qty, value: item.value, notes: item.notes });
    else addUnifiedInventoryRow({ name: item.name, type: item.type || "gear", rarity: item.rarity, qty: item.qty, value: item.value, details: item.notes });
    updateInventoryWealth();
    markCharacterDirty();
    party.stash.items = party.stash.items.filter(entry => entry.id !== item.id);
    refreshCurrentMember();
    renderStash();
    scheduleOverview();
    saveStash();
    window.showToast?.(`${item.name || "Item"} moved to your inventory. Save your character to keep it.`);
  }

  function updateItemSummary(row, item) {
    row.dataset.rarity = inventoryRarityKey(item.rarity);
    row.querySelector(".inventory-entry-name").textContent = item.name || "New item";
    row.querySelector(".inventory-entry-meta").textContent = itemMeta(item);
    row.querySelector(".inventory-entry-qty").textContent = item.qty ? `×${item.qty}` : "";
    row.querySelector(".inventory-entry-value").textContent = item.value;
  }

  function handleClick(event) {
    const action = event.target.closest("[data-party-action]")?.dataset.partyAction;
    if (action === "refresh") { loadParty({ force: true }); return; }
    if (action === "add-loot") { addStashItem({}, "loot"); return; }
    if (action === "add-party") { addStashItem({}, "party"); return; }
    if (action === "add-library") { openItemPicker(data => addStashItem(data || {}, "loot")); return; }
    if (action === "add-container") {
      party.stash.containers.push({ id: newId("party-container"), name: "", carriedBy: "", notes: "" });
      renderStash();
      document.querySelector(".party-container-row:last-child [data-container-field='name']")?.focus();
      return;
    }
    if (action === "remove-container") {
      const id = event.target.closest("[data-party-container]").dataset.partyContainer;
      party.stash.containers = party.stash.containers.filter(container => container.id !== id);
      party.stash.items.forEach(item => { if (item.container === id) item.container = ""; });
      renderStash();
      scheduleOverview();
      scheduleSave();
      return;
    }
    const item = action ? findItem(event.target) : null;
    if (action === "claim" && item) {
      item.claimedBy = currentCharacterId;
      renderStash();
      scheduleOverview();
      saveStash();
      return;
    }
    if (action === "take" && item) { takeItem(item); return; }
    if (action === "remove" && item) {
      if (item.name && !confirm(`Remove ${item.name} from the party stash?`)) return;
      party.stash.items = party.stash.items.filter(entry => entry.id !== item.id);
      renderStash();
      scheduleOverview();
      scheduleSave();
      return;
    }

    const summary = event.target.closest("[data-party-toggle]");
    if (summary && !event.target.closest(".party-quick")) {
      const row = summary.closest("[data-party-item]");
      const id = row.dataset.partyItem;
      const open = !party.open.has(id);
      if (open) party.open.add(id); else party.open.delete(id);
      row.classList.toggle("is-open", open);
      row.querySelector(".inventory-entry-editor").hidden = !open;
      row.querySelector(".inventory-entry-open").setAttribute("aria-expanded", String(open));
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.id === "partySearchInput") {
      party.search = target.value;
      document.querySelector(".party-find-caption").textContent = party.search.trim() ? "Matching items" : "Potions & consumables";
      document.getElementById("partyFindResults").innerHTML = renderFinderResults();
      return;
    }
    if (target.dataset.partyCoin) {
      party.stash.coins[target.dataset.partyCoin] = target.value.trim();
      const purse = coinsInGold(party.stash.coins);
      const members = party.members.length || 1;
      target.closest(".party-stash-group").querySelector(".party-subhdr em").textContent = formatGold(purse);
      target.closest(".party-stash-group").querySelector(".party-split").textContent = purse ? `Split ${members} way${members === 1 ? "" : "s"}: ${formatGold(Math.floor(purse / members * 100) / 100)} each` : "";
      scheduleOverview();
      scheduleSave();
      return;
    }
    if (target.dataset.containerField) {
      const id = target.closest("[data-party-container]").dataset.partyContainer;
      const container = party.stash.containers.find(entry => entry.id === id);
      if (!container) return;
      container[target.dataset.containerField] = target.value;
      // Keep container names in the item rows in step without redrawing the fields being typed in.
      if (target.dataset.containerField === "name") {
        document.querySelectorAll(`[data-party-field="container"] option[value="${CSS.escape(id)}"]`).forEach(option => { option.textContent = container.name || "Unnamed container"; });
        party.stash.items.filter(item => item.container === id).forEach(item => {
          const row = document.querySelector(`[data-party-item="${CSS.escape(item.id)}"]`);
          if (row) updateItemSummary(row, item);
        });
      }
      scheduleSave();
      return;
    }
    const field = target.dataset.partyField;
    const item = field ? findItem(target) : null;
    if (!item) return;
    item[field] = target.value;
    if (field === "category" && item.category !== "loot") item.claimedBy = "";
    // Moving an item between Unclaimed, Claimed, and Party Items redraws the stash.
    if (event.type === "change" && ["category", "claimedBy", "container"].includes(field)) renderStash();
    else updateItemSummary(target.closest("[data-party-item]"), item);
    scheduleOverview();
    scheduleSave();
  }

  // Moves an item from this character's inventory into the party stash.
  async function sendToParty(row) {
    if (!currentCharacterCampaignId) {
      alert("This character isn’t in a campaign, so there is no party stash to send items to.");
      return;
    }
    if (party.key !== `${currentCharacterId || ""}|${currentCharacterCampaignId || ""}` || !party.stash) await loadParty({ force: true });
    if (!party.stashAvailable) {
      alert("The shared party stash is not available on this server yet.");
      return;
    }
    const name = row.querySelector(".inventory-item-name")?.value.trim() || "";
    addStashItem({
      name,
      type: row.querySelector(".inventory-item-type")?.value,
      rarity: row.querySelector(".inventory-item-rarity")?.value,
      qty: row.querySelector(".inventory-item-qty")?.value.trim(),
      value: row.querySelector(".inventory-item-value")?.value.trim(),
      details: row.querySelector(".inventory-item-details")?.value
    }, "party");
    row.remove();
    refreshInventoryDependentOptions();
    markCharacterDirty();
    refreshCurrentMember();
    scheduleOverview();
    saveStash();
    window.showToast?.(`${name || "Item"} moved to the party stash. Save your character to remove it from your sheet.`);
  }

  // ── My Inventory / Party Inventory switch ─────────────────────────────

  function getStoredPage() {
    try { return localStorage.getItem(PAGE_KEY) === "party" ? "party" : "mine"; } catch { return "mine"; }
  }

  function setInventoryPage(page) {
    const showParty = page === "party";
    const mine = document.querySelector("#pg-inventory .inventory-page-grid");
    const partyPage = root();
    if (!mine || !partyPage) return;
    mine.hidden = showParty;
    partyPage.hidden = !showParty;
    document.querySelectorAll("[data-inventory-page]").forEach(button => {
      const active = button.dataset.inventoryPage === page;
      button.classList.toggle("on", active);
      button.setAttribute("aria-selected", String(active));
    });
    try { localStorage.setItem(PAGE_KEY, page); } catch {}
    if (showParty) loadParty();
  }

  window.setInventoryPage = setInventoryPage;

  document.addEventListener("DOMContentLoaded", () => {
    const page = root();
    if (!page) return;
    page.addEventListener("click", handleClick);
    page.addEventListener("input", handleInput);
    page.addEventListener("change", handleInput);
    document.querySelectorAll("[data-inventory-page]").forEach(button => button.addEventListener("click", () => setInventoryPage(button.dataset.inventoryPage)));
    document.getElementById("inventoryItemsBody")?.addEventListener("click", event => {
      const button = event.target.closest(".inventory-entry-to-party");
      if (button) sendToParty(button.closest(".inventory-entry"));
    });
    setInventoryPage(getStoredPage());
  });

  // Reload the party when the Inventory tab opens on the party page (the character may have changed).
  const originalSw = window.sw;
  window.sw = function (name, button) {
    originalSw(name, button);
    if (name === "inventory" && !root()?.hidden) loadParty();
  };
})();
