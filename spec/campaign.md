# Campaign Domain

Package: `pkg/campaign`

The Campaign domain stores shared campaign state. Current state includes the Materra calendar date, days traveled, schema version, and update timestamp.

## Repository Behavior

- `Get` loads campaign state and returns defaults when no persisted state exists.
- `Save` validates, normalizes, timestamps, and persists campaign state.

## HTTP Routes

- `GET /api/campaign-state` returns campaign state.
- `POST /api/campaign-state` saves campaign state.
