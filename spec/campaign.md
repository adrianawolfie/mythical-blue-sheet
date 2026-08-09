# Campaign Domain

Package: `pkg/campaign`

The Campaign domain stores campaign state. Current state includes the campaign ID, campaign name, Materra calendar date, days traveled, players, schema version, and update timestamp.

Campaign records are stored as `campaign/{id}.json`. The campaign list is stored in `campaign/index.json` and contains campaign IDs used to load the full campaign records. Campaign `players` contains user IDs; server-rendered admin pages resolve those IDs to user names for display and can add or remove players.

## Repository Behavior

- `List` loads `campaign/index.json`, reads each listed campaign file, and returns full campaigns.
- `GetByID` loads one campaign from `campaign/{id}.json`.
- `SaveCampaign` validates, normalizes, timestamps, and persists one campaign to `campaign/{id}.json`.
- `Get` loads shared campaign state for `/api/campaign-state` and returns defaults when no persisted state exists.
- `Save` validates, normalizes, timestamps, and persists campaign state.

## Admin Routes

- `GET /admin/campaigns` renders campaigns and player assignment controls.
- `POST /admin/campaigns/{id}/players` adds a user ID to a campaign's players.
- `DELETE /admin/campaigns/{id}/players/{userId}` removes a user ID from a campaign's players.

## HTTP Routes

- `GET /api/campaign-state` returns campaign state.
- `POST /api/campaign-state` saves campaign state.
