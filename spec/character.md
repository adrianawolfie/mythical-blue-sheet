# Character Domain

Package: `pkg/character`

The Character domain stores player character sheets and a lightweight character index. Character data includes user assignment, campaign assignment, summary fields, raw sheet fields, custom lists, inventory, spells, features, journal notes, UI state, and status values.

`campaignId` links a character to a campaign. An empty `campaignId` means the character is not assigned to a campaign.

## Repository Behavior

- `List` returns the character index and accepts functional options such as filtering by user ID.
- `GetByID` loads a full character by ID.
- `CreateOrReplace` saves a character and updates the index.
- `Delete` removes a character and updates the index.
- `ListForUser` resolves the current user and returns only characters owned by that user for the character list page.
- `ListAdmin` resolves character ownership names for the admin character page.
- `AssignToUser` validates the user assignment and persists it.
- `UpdateStatus` applies frequently changing status fields and persists the character.

## HTTP Routes

- `GET /api/characters` returns the character index.
- `GET /api/characters?mine=1` returns only character index records assigned to the user identified by the `user` cookie, or `401` when no valid user cookie is present.
- `GET /api/characters/{id}` returns one character.
- `POST /api/characters` creates or replaces one character.
- `POST /api/characters/{id}/status` updates frequently changing status fields such as HP, temp HP, armor class, and conditions.
- `DELETE /api/characters/{id}` deletes one character.
