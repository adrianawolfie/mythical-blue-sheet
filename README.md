# Mythical Blue · The Great Depth

## Architecture

This app intentionally uses plain HTML, CSS, and JavaScript. It does not require
a framework or build process.

## Environment behavior

The same `js/storage-config.js` file works in both environments:

```text
GitHub Pages / localhost
→ browser localStorage test data

Local server
→ shared /api filesystem handlers
→ public/characters and public/campaign JSON files

`MYTHICAL_BLUE_STORAGE_MODE` can force the server to use `api`, `local`, or `s3` mode.

If a `.env` file exists at startup, it is loaded after the process environment and wins on conflicts.
```

This prevents an accidental repository copy from silently switching production
into localStorage mode.

## Frontend structure

```text
index.html

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

## Save structure

Character JSON remains backwards compatible. No character migration is required
for this cleanup.

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


## Inventory page

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

This means existing saves remain readable while players gradually move items
into the structured lists.


## Inventory phase 2

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

Coinage is mirrored between Main and Inventory, while only one canonical copy is
stored in the character fields.


## Inventory phase 3

Equipped & Carried now supports:

```text
Equipment items
Magic items
Storage / bags
```

Armor and Clothing are separate equipped slots.

Coinage uses the original coin-box layout again. The Inventory page also has a
structured Gems & Valuables table stored under:

```text
customLists.gems
```


## Inventory layout refinement

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

## SRD libraries and picker flows

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

SRD picker entries can be previewed before adding them. Imported entries remain
editable character snapshots, and custom spells, feats, traits, and items remain
supported.
