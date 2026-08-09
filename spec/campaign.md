# Campaign Domain

Package: `pkg/campaign`

The Campaign domain stores campaign state. Current state includes the campaign ID, campaign name, Materra calendar date, days traveled, players, schema version, and update timestamp.

Campaign records are stored as `campaign/{id}.json`. The campaign list is stored in `campaign/index.json` and contains campaign IDs used to load the full campaign records. Campaign `players` contains user IDs; server-rendered admin pages resolve those IDs to user names for display.

## Repository Behavior

- `List` loads `campaign/index.json`, reads each listed campaign file, and returns full campaigns.
- `Get` loads shared campaign state for `/api/campaign-state` and returns defaults when no persisted state exists.
- `Save` validates, normalizes, timestamps, and persists campaign state.

## HTTP Routes

- `GET /api/campaign-state` returns campaign state.
- `POST /api/campaign-state` saves campaign state.
