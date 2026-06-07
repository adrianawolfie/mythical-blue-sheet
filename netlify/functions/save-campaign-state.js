exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const path = "campaign/campaign-state.json";

    const date = body.calendarDate || {};
    const daysTraveled = Math.max(0, Number(body.daysTraveled) || 0);

    if (!Number.isInteger(Number(date.year)) || Number(date.year) < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Campaign year is invalid." })
      };
    }

    if (
      date.special !== null &&
      date.special !== "intercalis" &&
      date.special !== "aenaris"
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Campaign special day is invalid." })
      };
    }

    if (
      date.special === null &&
      (
        !Number.isInteger(Number(date.month)) ||
        Number(date.month) < 1 ||
        Number(date.month) > 13 ||
        !Number.isInteger(Number(date.day)) ||
        Number(date.day) < 1 ||
        Number(date.day) > 28
      )
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Campaign calendar date is invalid." })
      };
    }

    async function getFile() {
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

      return response.json();
    }

    const existingFile = await getFile();

    const savedAt = new Date().toISOString();

    const nextState = {
      schemaVersion: 1,
      updatedAt: savedAt,
      calendarDate: {
        year: Number(date.year),
        month: date.special === null ? Number(date.month) : null,
        day: date.special === null ? Number(date.day) : null,
        special: date.special
      },
      daysTraveled
    };

    const putBody = {
      message: "[skip netlify] Update shared campaign calendar",
      content: Buffer.from(
        JSON.stringify(nextState, null, 2)
      ).toString("base64"),
      branch
    };

    if (existingFile?.sha) {
      putBody.sha = existingFile.sha;
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
      return {
        statusCode: 409,
        body: JSON.stringify({
          error:
            "Campaign state changed at the same time. Refresh and try again."
        })
      };
    }

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(nextState)
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
