exports.handler = async (event) => {
  try {
    const incomingData = JSON.parse(event.body || "{}");

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!incomingData?.id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Character ID is missing."
        })
      };
    }

    const characterId = String(incomingData.id);

    if (!/^[a-zA-Z0-9_-]+$/.test(characterId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Character ID contains invalid characters."
        })
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
      const body = {
        message,
        content: Buffer.from(
          JSON.stringify(contentObject, null, 2)
        ).toString("base64"),
        branch
      };

      if (existingSha) {
        body.sha = existingSha;
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
          body: JSON.stringify(body)
        }
      );

      if (response.status === 409) {
        return {
          conflict: true
        };
      }

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return {
        conflict: false
      };
    }

    const existingFile = await getFile(characterPath);

    if (existingFile?.content) {
      const existingCharacter = JSON.parse(
        Buffer.from(existingFile.content, "base64").toString("utf8")
      );

      if (existingCharacter.id !== characterId) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error:
              "Save blocked: the filename and internal character ID do not match. " +
              "This could overwrite another character."
          })
        };
      }

      const expectedUpdatedAt = incomingData.expectedUpdatedAt || null;
      const latestUpdatedAt = existingCharacter.updatedAt || null;

      if (!expectedUpdatedAt) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error:
              "Save blocked: this character already exists, but the browser does not have a valid edit version. " +
              "Return to the index, reopen the character, and try again."
          })
        };
      }

      if (latestUpdatedAt && expectedUpdatedAt !== latestUpdatedAt) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error:
              "Save blocked: someone else updated this character after you opened it. " +
              "Copy any important changes, reopen the character from the index, and try again."
          })
        };
      }
    }

    const savedAt = new Date().toISOString();

    const characterToSave = {
      ...incomingData,
      updatedAt: savedAt
    };

    delete characterToSave.expectedUpdatedAt;

    const result = await saveFile(
      characterPath,
      characterToSave,
      `[skip netlify] Save character ${
        characterToSave.summary?.name || characterId
      }`,
      existingFile?.sha || null
    );

    if (result.conflict) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error:
            "Save blocked: another save happened at almost the same time. " +
            "Return to the index, reopen the character, and try again."
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        updatedAt: savedAt
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
