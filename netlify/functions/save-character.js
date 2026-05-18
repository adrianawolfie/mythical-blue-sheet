exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    async function getFile(path) {
      const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json"
        }
      });

      if (!response.ok) return null;
      return await response.json();
    }

    async function saveFile(path, contentObject, message) {
      const existing = await getFile(path);

      const body = {
        message,
        content: Buffer.from(JSON.stringify(contentObject, null, 2)).toString("base64"),
        branch
      };

      if (existing?.sha) {
        body.sha = existing.sha;
      }

      const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
    }

    const characterPath = `characters/${data.id}.json`;

    await saveFile(
      characterPath,
      data,
      `Save character ${data.summary?.name || data.id}`
    );

    const indexFile = await getFile("characters/character-index.json");

    let index = [];

    if (indexFile?.content) {
      index = JSON.parse(Buffer.from(indexFile.content, "base64").toString("utf8"));
    }

    const summary = {
      id: data.id,
      name: data.summary?.name || "Unnamed Character",
      armorClass: data.summary?.armorClass || "",
      hpCurrent: data.summary?.hpCurrent || "",
      hpMax: data.summary?.hpMax || "",
      passivePerception: data.summary?.passivePerception || "",
      file: characterPath,
      updatedAt: data.updatedAt
    };

    const existingIndex = index.findIndex(c => c.id === data.id);

    if (existingIndex >= 0) {
      index[existingIndex] = summary;
    } else {
      index.push(summary);
    }

    await saveFile(
      "characters/character-index.json",
      index,
      `Update character index`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
