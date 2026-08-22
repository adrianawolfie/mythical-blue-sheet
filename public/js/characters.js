(() => {
  const list = document.getElementById("characterList");

  function addMeta(meta, label, value) {
    const item = document.createElement("span");
    item.textContent = `${label}: ${value || "-"}`;
    meta.appendChild(item);
  }

  function renderCharacters(characters) {
    list.replaceChildren();
    if (!characters.length) {
      const empty = document.createElement("p");
      empty.className = "character-list-empty";
      empty.textContent = "No characters are assigned to your account yet.";
      list.appendChild(empty);
      return;
    }

    characters.forEach(character => {
      const card = document.createElement("a");
      card.className = "character-list-card";
      card.href = `/character.html?id=${encodeURIComponent(character.id)}`;

      const name = document.createElement("span");
      name.className = "character-list-name";
      name.textContent = character.name || "Unnamed Character";

      const meta = document.createElement("span");
      meta.className = "character-list-meta";
      addMeta(meta, "Class", character.class);
      addMeta(meta, "Species", character.species);
      addMeta(meta, "Subclass", character.subclass);
      addMeta(meta, "Level", character.level);

      card.append(name, meta);
      list.appendChild(card);
    });
  }

  async function loadCharacters() {
    try {
      const response = await fetch("/api/characters?owned=1", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login.html");
        return;
      }
      if (!response.ok) throw new Error("Could not load characters.");
      renderCharacters(await response.json());
    } catch (error) {
      console.error(error);
      list.replaceChildren();
      const message = document.createElement("p");
      message.className = "character-list-empty";
      message.textContent = error.message || "Could not load characters.";
      list.appendChild(message);
    }
  }

  loadCharacters();
})();
