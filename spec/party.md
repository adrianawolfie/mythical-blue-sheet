# Party Domain

Package: `pkg/party`

The Party domain stores each campaign's shared party inventory: the party purse (copper, silver, electrum, gold, and platinum pieces), containers such as a bag of holding or cart (with the character carrying them and notes), and items. An item's `category` is `party` for gear the whole party owns, or `loot` for treasure still to be divided. Loot with an empty `claimedBy` is unclaimed; otherwise `claimedBy` holds the claiming character's ID. An item's `container` refers to one of the party containers.

Party inventories are stored as `party/{campaignId}.json`. Campaign IDs may contain only letters, digits, `-`, and `_`.

## Repository Behavior

- `Get` returns a campaign's party inventory, or an empty inventory when none has been saved.
- `Save` validates the campaign ID, limits the inventory to 500 items and 50 containers, trims and shortens text, drops empty items and containers, clears claims on party items and references to missing containers, timestamps `updatedAt`, and persists the inventory.
- `Save` rejects a non-empty `expectedUpdatedAt` that no longer matches the stored `updatedAt`, so one player's save cannot silently overwrite another's.

## HTTP Routes

- `GET /api/party-inventory?campaignId={id}` returns the campaign's party inventory, or `400` for a missing or invalid campaign ID.
- `POST /api/party-inventory` saves a party inventory and returns it, `409` when `expectedUpdatedAt` is stale, or `400` when it is invalid.
