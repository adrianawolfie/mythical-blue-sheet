exports.handler = async (event) => {
  try {
    const { id } = JSON.parse(event.body || "{}");

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing character id" })
      };
    }

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

      if (!existing?.sha) {
        throw new Error(`Cannot update missing file: ${path}`);
      }

      const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          content: Buffer.from(JSON.stringify(contentObject, null, 2)).toString("base64"),
          sha: existing.sha,
          branch
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
    }

    async function deleteFile(path, message) {
      const existing = await getFile(path);

      if (!existing?.sha) {
        return;
      }

      const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          sha: existing.sha,
          branch
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
    }

    const characterPath = `characters/${id}.json`;

await deleteFile(characterPath, `[skip netlify] Delete character ${id}`);

    const indexFile = await getFile("characters/character-index.json");

    let index = [];

    if (indexFile?.content) {
      index = JSON.parse(Buffer.from(indexFile.content, "base64").toString("utf8"));
    }

    index = index.filter(character => character.id !== id);

await saveFile(
  "characters/character-index.json",
  index,
  `[skip netlify] Remove character from index`
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
