# Statblock Domain

Package: `pkg/statblock`

The Statblock domain stores campaign custom monster/statblock definitions used by the DM screen. It normalizes custom monster fields, enforces limits, and sorts saved statblocks.

## Repository Behavior

- `List` returns custom statblocks.
- `Save` validates and persists the full custom statblock list.

## HTTP Routes

- `GET /api/custom-statblocks` returns custom statblocks.
- `POST /api/custom-statblocks` saves custom statblocks.
