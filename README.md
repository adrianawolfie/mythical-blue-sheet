# Mythical Blue · The Great Depth

## Architecture

This app intentionally uses plain HTML, CSS, and JavaScript. It does not require
a framework or build process.

## Environment behavior

The same `js/storage-config.js` file works in both environments:

```text
GitHub Pages / localhost
→ browser localStorage test data

Netlify production
→ shared Netlify Functions
→ GitHub character JSON files
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
  storage-adapter.js         localStorage / Netlify abstraction

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

netlify/
  functions/
    get-character-index.js
    get-character.js
    save-character.js
    save-character-status.js
    delete-character.js
```

## Save structure

Character JSON remains backwards compatible. No character migration is required
for this cleanup.

Frequently changing values are saved through:

```text
netlify/functions/save-character-status.js
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
