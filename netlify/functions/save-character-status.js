exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!body?.id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Character ID is missing." })
      };
    }

    const characterId = String(body.id);

    if (!/^[a-zA-Z0-9_-]+$/.test(characterId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Character ID contains invalid characters." })
      };
    }

    const characterPath = `characters/${characterId}.json`;

    async function getFile(path) {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}&t=${Date.now()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Cache-Control": "no-cache"
          }
        }
      );

      if (response.status === 404) return null;

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return await response.json();
    }

    async function saveFile(path, contentObject, message, existingSha = null) {
      const putBody = {
        message,
        content: Buffer.from(
          JSON.stringify(contentObject, null, 2)
        ).toString("base64"),
        branch
      };

      if (existingSha) {
        putBody.sha = existingSha;
      }

      const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(putBody)
        }
      );

      if (response.status === 409) {
        return { conflict: true };
      }

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return { conflict: false };
    }

    const existingFile = await getFile(characterPath);

    if (!existingFile?.content) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Character not found." })
      };
    }

    const character = JSON.parse(
      Buffer.from(existingFile.content, "base64").toString("utf8")
    );

    const hpCurrent = body.hpCurrent ?? "";
    const hpMax = body.hpMax ?? "";
    const tempHp = body.tempHp ?? "";
    const armorClass = body.armorClass ?? "";
    const armorClassState =
      body.armorClassState && typeof body.armorClassState === "object"
        ? body.armorClassState
        : null;
    const currentConditions = body.currentConditions ?? "";

    character.summary = character.summary || {};
    character.fields = character.fields || {};

    character.summary.hpCurrent = hpCurrent;
    character.summary.hpMax = hpMax;
    character.summary.tempHp = tempHp;
    character.summary.armorClass = armorClass;
    character.summary.currentConditions = currentConditions;

    if (armorClassState) {
      character.customLists = character.customLists || {};
      character.customLists.armorClass = armorClassState;
    }

    character.fields.hpCurrent = hpCurrent;
    character.fields.hpMax = hpMax;
    character.fields.tempHp = tempHp;
    character.fields.armorClass = armorClass;
    character.fields.currentConditions = currentConditions;

    const savedAt = new Date().toISOString();
    character.updatedAt = savedAt;

    const result = await saveFile(
      characterPath,
      character,
      `[skip netlify] Update live summary for ${character.summary?.name || characterId}`,
      existingFile.sha
    );

    if (result.conflict) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "Live-summary save had a race condition; the latest value will arrive via polling."
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, updatedAt: savedAt })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
