# Mythical Blue DM Screen — Production Transfer

Copy the files in this archive into the root of the production repository, preserving the folder structure.

## Add or replace

- index.html
- dm-screen.html
- css/character-overview.css
- css/dm-screen.css
- js/dm-screen.js
- data/srd-statblocks.json

## Important

This bundle intentionally excludes character JSON files. During comparison, the test repository contained an older Nimue character seed than production. Keeping character data out of this transfer prevents a production character rollback.

The bundle also intentionally does not delete production-only files such as:
- netlify/functions/save-hp.js
- srd-spells.json

## Included functionality

- Mythical Blue styling for the character overview
- Navigation from the character overview to the DM screen
- Initiative tracker with live player HP, AC, and conditions
- NPC support, concentration toggles, next-turn progression, and round tracking
- SRD statblock picker with searchable filters
- Inline expandable Mythical Blue statblocks
- Tracker alignment fixes
- Multi-digit initiative input fix
- Structured ability cards with Mod and Save labels
