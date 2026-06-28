# Mythical Blue Specification

## Overview

Mythical Blue is a plain HTML, CSS, and JavaScript app. It does not require a framework or build process.

## Environment Behavior

The same `js/storage-config.js` file works in both environments:

```text
GitHub Pages / localhost
-> browser localStorage test data

Local server
-> shared /api filesystem handlers
-> public/characters and public/campaign JSON files

`MYTHICAL_BLUE_STORAGE_MODE` can force the server to use `api`, `local`, or `s3` mode.

If a `.env` file exists at startup, it is loaded after the process environment and wins on conflicts.
```

This prevents an accidental repository copy from silently switching production into localStorage mode.

## Frontend Structure

```text
index.html
dm-screen.html

assets/
  compass.png
  corner.png
  parchment-seamless.png
  parchment.jpg
  ship.png
  title-banner.png

css/
  styles.css                 import-only entry point
  base.css                   global layout and base styles
  character-sheet.css        sheet sections and mobile layout
  components.css             shared sheet components such as HP tracker
  inventory.css              inventory-page layout and tables
  character-overview.css     Saved Characters cards and live controls
  speeds.css                 optional movement speeds
  calendar.css               Materra calendar
  accessibility.css          Aa text-size controls

js/
  conditions.js              condition reference data
  storage-config.js          automatic environment detection
  storage-adapter.js         localStorage / API abstraction

  core.js                    schema, migrations, load/save, navigation
  tables.js                  weapons and spells
  conditions-ui.js           sheet condition controls
  features.js                features and traits
  proficiencies.js           proficiency rows
  inventory.js               structured inventory tables
  speeds.js                  optional movement speeds
  character-overview.js      Saved Characters cards
  live-sync.js               HP / AC / conditions autosave and polling
  app.js                     startup and event binding

  calendar.js                Materra calendar behavior
  accessibility.js           font-size controls

api/
  characters
  campaign-state
  custom-statblocks
```

## Save Structure

Character JSON remains backwards compatible. No character migration is required for this cleanup.

Frequently changing values are saved through:

```text
/api/characters/:id/status
```

This handles:

```text
HP
Temp HP
Armor Class
Conditions
```

## Inventory Page

The fourth sheet tab contains structured inventory lists:

```text
Equipment
Attunement
Magic Items
Potions & Consumables
Coinage
```

Older freeform character text remains available under:

```text
Imported / Freeform Notes
```

This means existing saves remain readable while players gradually move items into the structured lists.

## Inventory Phase 2

Inventory now has three layers:

```text
What do I own?
Where is it stored?
What am I currently wearing or carrying?
```

New structured data:

```text
customLists.storageLocations
customLists.equippedSlots
```

Coinage is mirrored between Main and Inventory, while only one canonical copy is stored in the character fields.

## Inventory Phase 3

Equipped & Carried now supports:

```text
Equipment items
Magic items
Storage / bags
```

Armor and Clothing are separate equipped slots.

Coinage uses the original coin-box layout again. The Inventory page also has a structured Gems & Valuables table stored under:

```text
customLists.gems
```

## Inventory Layout Refinement

The inventory page now has a clearer hierarchy:

```text
Coinage & Gems
Equipped & Carried
Location filter
Equipment
Containers & Locations | Attunement
Magic Items | Potions & Consumables
Other Inventory
Imported / Freeform Notes
```

Equipped & Carried supports custom wearable slots stored under:

```text
customLists.customEquippedSlots
```

The shared inventory location filter applies to:

```text
Equipment
Magic Items
Potions & Consumables
Gems & Valuables
```

## SRD Libraries and Picker Flows

The character sheet includes editable snapshot import flows for SRD 5.2.1 content:

```text
data/srd-spells.json   351 spells
data/srd-feats.json     17 feats
data/srd-items.json    435 equipment and magic-item entries
```

Visible actions are placed near the top of their relevant sections:

```text
Spells      + Add Spell | + Create Homebrew Spell
Features    + Add Feat | + Custom Feature / Trait
Inventory   + Add Item | + Custom Item
```

SRD picker entries can be previewed before adding them. Imported entries remain editable character snapshots, and custom spells, feats, traits, and items remain supported.

## DM Screen Search / Mobile / Unsaved Patch

### DM Screen

- Replaced broad substring statblock search with token-aware search.
- Short searches such as `rat` no longer match words such as `aberration`, `creature`, or `restoration`.
- Names remain searchable, including useful cases such as `Rat`, `Swarm of Rats`, `Giant Rat`, and `Wererat`.
- Mobile Add NPC modal now keeps its result list reachable and scrollable after searching.
- Proficiency checkboxes in the custom statblock builder are forced to compact checkbox sizing on desktop and mobile.

### Character Sheet

- Added dirty-state tracking while a character sheet is open.
- Typing or changing fields, or using sheet controls, marks the character as having unsaved changes.
- Saving, loading, creating a fresh blank sheet, or deleting clears the dirty state.
- Closing or reloading the tab triggers the browser's native unsaved-changes prompt.
- Returning to the character list, starting a new character, resetting test data, or deleting asks for confirmation first when unsaved changes exist.

## Production Transfer - Latest Delta

### Add or Replace

- `index.html`
- `css/character-sheet.css`
- `css/inventory.css`
- `css/theme-mode.css`
- `js/app.js`
- `js/core.js`
- `js/defenses.js`
- `js/features.js`
- `js/journal-notes.js`

### Preserved Production-Only Files

- `srd-spells.json`
- `/api/characters/:id/status`
- `characters/*`
- `campaign/*`

## Production Transfer - DM Screen Custom Monsters

Upload these files over the latest production repository. This package contains only DM Screen related changes and does not include character JSON files.

### Add or Replace

- `dm-screen.html`
- `css/dm-screen.css`
- `js/dm-screen.js`
- `data/custom-statblocks.json`
- `/api/custom-statblocks`

### What This Adds

- Preview statblocks before adding NPCs.
- Create and edit custom monster statblocks in the Mythical Blue builder.
- Editing SRD monsters creates a custom campaign copy instead of changing the SRD library.
- Bundled Custom Monsters category with Deck Swabbie, Below Deck Swabbie, and Bosun.
- Legendary Resistances and Legendary Actions tracked compactly on one initiative-tracker row.
- Legendary Actions reset at the start of the monster's turn when using Next Turn.
- Proficiency bonus support in statblock previews and the builder.
- Saving throw proficiency and skill proficiency/expertise support in the builder.
- Description field shown inside the statblock, not on the initiative tracker.
- Action line-break parsing so entries such as Scimitar and Crossbow (light) render as separate action blocks.
- Campaign-wide saved custom monsters through local API routes.

### Production Saving Requirement

The previous GitHub-backed functions used the same GitHub API pattern as the existing live HP save function. That backend is now replaced locally, but the production repository still needs these environment variables if it keeps any GitHub-backed sync path:

- `GITHUB_TOKEN`
- `GITHUB_REPO`
- `GITHUB_BRANCH`, optional; defaults to `main`

Custom campaign monsters are saved to `campaign/custom-statblocks.json` in the GitHub repository. If the file does not exist yet, the save function creates it.

### Validation Performed

- JavaScript syntax check passed for `dm-screen.js`.
- JavaScript syntax check passed for the API handlers and client code.
- JSON files parse correctly.
- `dm-screen.html` local references resolve.
- No character files are included.

## Item Input Focus Patch

Fixes a custom inventory item issue where typing in the item name/title field could trigger a sort/filter rebuild after every letter. On desktop and mobile, that could cause the field to lose focus, forcing the user to tap or click it again for each character.

The item name now updates the row summary and equipped-item dropdowns while typing, but inventory sorting and filtering is only committed when the field changes or blurs, or when Enter is pressed.
