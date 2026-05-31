exports.handler = async () => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Cache-Control": "no-cache"
    };

    const folderResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/characters?ref=${branch}&t=${Date.now()}`,
      {
        headers
      }
    );

    if (!folderResponse.ok) {
      return {
        statusCode: folderResponse.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify({
          error: await folderResponse.text()
        })
      };
    }

    const files = await folderResponse.json();

    const characterFiles = files.filter(file =>
      file.type === "file" &&
      file.name.endsWith(".json") &&
      file.name !== "character-index.json"
    );

    const characters = await Promise.all(
      characterFiles.map(async file => {
        try {
          const response = await fetch(
            `https://api.github.com/repos/${repo}/contents/${file.path}?ref=${branch}&t=${Date.now()}`,
            {
              headers
            }
          );

          if (!response.ok) {
            console.error(`Could not load ${file.path}`);
            return null;
          }

          const githubFile = await response.json();

          const character = JSON.parse(
            Buffer.from(githubFile.content, "base64").toString("utf8")
          );

          const expectedFilename = `${character.id}.json`;

          if (!character.id || file.name !== expectedFilename) {
            console.error(`Skipped mismatched character file: ${file.path}`);
            return null;
          }

          return {
            id: character.id,
            name: character.summary?.name || "Unnamed Character",
            armorClass: character.summary?.armorClass || "",
            hpCurrent: character.summary?.hpCurrent || "",
            hpMax: character.summary?.hpMax || "",
            passivePerception: character.summary?.passivePerception || "",
            currentConditions: character.summary?.currentConditions || "",
            file: file.path,
            updatedAt: character.updatedAt || ""
          };
        } catch (error) {
          console.error(`Skipped invalid character file: ${file.path}`);
          console.error(error);
          return null;
        }
      })
    );

    const validCharacters = characters
      .filter(Boolean)
      .sort((a, b) => {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(validCharacters)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
