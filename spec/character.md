# Character Domain

Package: `pkg/character`

The Character domain stores player character sheets and a lightweight character index. Character data includes summary fields, raw sheet fields, custom lists, inventory, spells, features, journal notes, UI state, and status values.

## Repository Behavior

- `List` returns the character index.
- `GetByID` loads a full character by ID.
- `CreateOrReplace` saves a character and updates the index.
- `Delete` removes a character and updates the index.

## HTTP Routes

- `GET /api/characters` returns the character index.
- `GET /api/characters/{id}` returns one character.
- `POST /api/characters` creates or replaces one character.
- `POST /api/characters/{id}/status` updates frequently changing status fields such as HP, temp HP, armor class, and conditions.
- `DELETE /api/characters/{id}` deletes one character.
