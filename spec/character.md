# Character Domain

Package: `pkg/character`

The Character domain stores versioned player character sheets, independently updated live play state, and a lightweight character index. Character configuration includes user assignment, campaign assignment, summary fields, raw sheet fields, custom lists, inventory, spells, features, journal notes, and stable UI state.

`campaignId` links a character to a campaign. An empty `campaignId` means the character is not assigned to a campaign.

## Repository Behavior

- `List` returns active character summaries composed from the character index, current configuration, and live state. It accepts functional options such as filtering by user ID.
- `GetByID` loads `current.json` and `live.json`, computes effective values such as maximum HP, and returns the configuration with nested `live` data.
- `CreateOrReplace` saves configuration to `current.json`, creates an immutable UUIDv7 snapshot, appends history metadata, and updates the index. It does not replace existing live state.
- `CreateOrReplace` rejects stale `expectedUpdatedAt` values. Retrying an already completed equivalent save is idempotent.
- `UpdateLive` patches only supplied live fields and writes only `live.json`. Setting `hpOverride` to `null` restores the configured maximum HP.
- `ListHistory` and `GetHistory` expose immutable character configuration snapshots.
- `RestoreHistory` restores a snapshot as a new latest version without changing live state.
- `Delete` soft-deletes a character in the index so its configuration, live state, and history remain recoverable.
- `ListForUser` resolves the current user and returns only characters owned by that user for the character list page. Admin users receive all characters.
- `ListAdmin` resolves character ownership names for the admin character page.
- `AssignToUser` validates the user assignment and persists it. An empty user ID clears ownership.

## Persistence

- `character/character-index.json` stores active/deleted metadata and the current configuration path. Live values in list responses are projections and are not stored as authoritative index data.
- `character/{id}/current.json` stores current character configuration.
- `character/{id}/live.json` stores current HP, optional maximum-HP override, temporary HP, conditions, inspiration, exhaustion, death saves, spent hit dice, active armor-class modifiers, and `updatedAt`.
- `character/{id}/history.json` lists immutable snapshots.
- `character/{id}/versions/{uuidv7}.json` stores immutable character configuration snapshots.
- Legacy `character/{id}.json` files remain readable and migrate to the directory layout on the next meaningful character save.
- A new live record initializes current HP from configured maximum HP. Effective maximum HP is `live.hpOverride` when present and configured maximum HP otherwise.

## HTTP Routes

- `GET /api/characters` returns the character index.
- `GET /api/characters?mine=1` returns only character index records assigned to the user identified by the `user` cookie, or all records when the user is an admin, or `401` when no valid user cookie is present.
- `GET /api/characters?owned=1` returns only character index records assigned to the user identified by the `user` cookie, including for admin users, or `401` when no valid user cookie is present.
- `GET /api/characters/{id}` returns current character configuration combined with nested effective live state.
- `POST /api/characters` creates or replaces one character.
- `GET /api/characters/{id}/live` returns effective live state.
- `PATCH /api/characters/{id}/live` patches supplied live fields and returns effective live state.
- `GET /api/characters/{id}/history` lists character versions.
- `GET /api/characters/{id}/history/{version}` returns one immutable version.
- `POST /api/characters/{id}/history/{version}/restore` restores a version and returns the newly composed character.
- `DELETE /api/characters/{id}` soft-deletes one character.
- `GET /api/admin/characters` returns the current admin user, character admin views, assignable users, and character count for the static admin characters page.
- `POST /admin/characters/{id}/assignment` assigns a character to a user or clears ownership when `userId` is empty.
- `DELETE /admin/characters/{id}` deletes one character as an admin.
