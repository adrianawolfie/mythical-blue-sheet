# Project Spec

## Overview

Mythical Blue Sheet is a Go HTTP server with a plain HTML, CSS, and JavaScript frontend. The server exposes JSON API routes for persisted data and serves static HTML pages from `public/`.

The application has three main package boundaries:

- Domain packages in `pkg/<domain>` define application data and repository behavior.
- HTTP handlers in `pkg/server` implement the API and page routes.
- Storage implementations in `pkg/storage` provide file/object access for repositories.

## API Architecture

Each API domain owns the types and repository methods that describe the domain. HTTP handlers call those domain repositories instead of reading or writing storage directly.

Repositories are decoupled from concrete storage through the `storage.Storage` interface. The application can use local filesystem storage or S3 storage without changing domain or server handler code.

The API is the HTTP server implementation of those domain repositories. Keep HTTP parameter decoding, request decoding, response encoding, redirects, and cookies in `pkg/server`. Keep storage paths, JSON persistence, validation, normalization, authorization lookups, cross-repository coordination, and domain rules in the owning repository package. When a domain rule requires data from another domain, the owning repository accepts an interface dependency on the other repository.

## API Domains

- `spec/character.md` describes the Character domain.
- `spec/campaign.md` describes the Campaign domain.
- `spec/statblock.md` describes the Statblock domain.
- `spec/party.md` describes the Party domain.
- `spec/user.md` describes the User domain.
- `spec/storage.md` describes the Storage boundary.

## HTTP Server

Entrypoint: `bin/main.go`

The server loads configuration, selects storage, creates repositories, registers page and API routes on `http.ServeMux`, applies CORS for the approved frontend origins, limits POST body size, and listens on port `8080`.

Credentialed CORS requests are accepted only from `https://raperonzolo.com` and `https://raperonzolo-app-test-xwpvf.ondigitalocean.app`. The authentication cookie is secure and configured for cross-site requests.

Static assets and static HTML are served from `public/` by the root file server. For paths without an extension, the file server tries the path with `.html` before the original path. Explicit page routes in `pkg/server` are limited to redirects; page data is loaded through JSON APIs.

## HTML Frontend

The frontend uses static HTML, CSS, and JavaScript. Dynamic page data is loaded from JSON APIs. Page variables use query parameters rather than path segments.

All page CSS lives in static CSS files under `public/css/` or another served CSS path. Pages should link only the CSS files they need. Pages should not use `<style>` blocks or `style` attributes; add or reuse classes in CSS files instead.

Use Lucide icons for application icons. Prefer self-hosted or inline Lucide SVG markup over external icon CDNs.

Logged-in pages load `public/css/account.css` and `public/js/account.js` to show a fixed top-right account button using a Lucide-style user icon. The shared account overlay fetches `GET /api/me` and submits `PUT /api/me` so users can change their display name and optionally set a new password. Theme selection and text-size controls live in the account overlay instead of the individual page headers. There are three themes, each with a daylight and a moonlight mode: Mythical Blue (the original nautical look), Neutral (graphite and warm white, no nautical artwork or wording), and Raperonzolo (an Art Nouveau look in lavender and lilac with sage green: Federo lettering, arched panels and ability blocks, whiplash ornaments beside section titles and under the title, a full arch framing the sheet, pill tabs and buttons, ringed stat medallions, and an Art Nouveau frame around the character sheet (flowing green vines that swell and taper, weave across and spill past the sheet edge and curl into tendrils, with shaded rampion bellflower sprays in two opposite corners; `public/js/nouveau-frame.js` draws it as an inline SVG sized to the sheet and redraws it when the sheet resizes) on a plain purple page background; it uses the same non-nautical wording as Neutral). `public/js/theme-mode.js` stores the theme in `localStorage` (`mythicalBlueThemeStyle`) and the mode separately (`mythicalBlueThemeMode`), sets `data-style` and `data-theme` on `<html>`, and keeps other open tabs in step. `public/css/theme-styles.css` holds the Neutral and Raperonzolo daylight palettes, which recolour the `--tone-*` variables defined in `public/css/base.css`; all three themes share the same moonlight colours. In moonlight rules every blue is written as `hsl()` of `--night-hue` and every gold as `hsl()` of `--night-gold-hue` (defined in `public/css/theme-mode.css`), so a theme can give moonlight its own colours by overriding those two values; reds, greens, whites, and rarity colours stay fixed, and the moonlight parchment texture is an image that would need its own version. Neutral and Raperonzolo use plain dark blue in moonlight, without the parchment texture. Outside Mythical Blue the compass, ship, and title-banner artwork are hidden (a text title replaces the banner), the Main tab uses a shield icon, and elements with `data-text-neutral`, `data-placeholder-neutral`, or `data-empty-neutral` (and optional `-raperonzolo` versions) show non-nautical wording; scripts use `window.themeText(mythicalBlue, other)` for text they build.

### `/`

File: `public/index.html`

The main character sheet application. It supports editing character details, stats, spells, features, inventory, journal notes, and live status data. Features & Traits lists each feature as one row showing its name, short description, and (when it tracks uses) a − / + counter with its maximum and recharge; the chevron or a click on the row opens the rules text, category, "+ Track uses" / "Stop tracking uses", and Remove feature, and a new custom feature opens ready to be named. Feature resources store a max (a number or `PB`), a recharge type, and, for compatibility with older servers and pages, the same resource as text such as `2/3 Short Rest`. Library feats in `public/data/srd-feats.json` may define a default `resource`; when a feature's resource is missing, the sheet fills it from the character's earlier versions or from the library and asks the player to save. Coinage is edited only in the Inventory section, which also shows total wealth (coins plus valuables, in gold). Gems & Valuables has its own card listing quantity, value each, per-row totals, and a running total; plain numbers are read as gold. Inventory items store an optional `rarity` (Common through Artifact). The Equipment list shows each item as one line (name coloured by rarity; type, rarity, and location; quantity and value) that opens an editor with all fields and the details text; sorting and filtering (location, type, rarity, search) live in the filter bar. Players mark attunement with a "Requires attunement" checkbox, which keeps a "Requires Attunement" note in the item details (library items already include it); those items get an Attune button that fills the first empty Attunement slot, or frees it when already attuned. Rarity is recovered from an item's value or first description line when not stored, which also moves library magic items' rarity out of the value field. The Weapons & Damage Cantrips card (`public/js/attacks.js`) lists attacks with an attack bonus or save DC, name, notes, and damage; "+ Add Attack" offers weapons from the inventory, damage spells from the spell list, Unarmed Strike, or a custom attack. Rows naming an SRD weapon (including "+1" magic weapons), a damage spell on the sheet, or Unarmed Strike keep their bonus and damage in step with level and ability scores unless the player typed their own values. Attacks are still saved as name, attack, damage, and notes text. The Inventory section has two pages, My Inventory and Party Inventory, and remembers the last one in the browser. Party Inventory (`public/js/party-inventory.js`) loads every character in the same campaign through the character API (the open character is read from the page, including unsaved edits) and the campaign's shared stash through the party inventory API. It shows party totals (wealth, coins, gems and valuables, gear value, healing potions and who has them, unclaimed loot), wealth by member, a search across every inventory that lists potions and consumables by default with owners and quantities, magic items, and each member's items grouped by location. The Party Stash holds unclaimed loot, claimed loot, party items, the party purse (with an even split per member), and containers; it saves on its own a moment after each change and does not mark the character unsaved. Loot can be claimed, and claimed loot can be taken into the open character's inventory; an item on My Inventory can be moved to the party stash. Both moves change the character sheet, which the player then saves. When the party inventory API is not available, the summaries still show and the stash cannot be saved. The Companions section (`public/js/companions.js`) lists familiars, pets, mounts, and other companions as stat cards: name, kind, creature, size and type; AC, hit points, temporary HP, speed, initiative, and CR; six ability scores with modifiers; and skills, senses, languages, hit dice, traits, actions, and notes. Companions are stored in `customLists.companions`; their current and temporary HP are live state and a long rest restores them. "+ From Creature Library" fills a companion from `public/data/srd-statblocks.json` through the shared library picker. The section tabs (Main, Spells, Inventory, Companions, Journal) stay pinned to the top while scrolling, and on touch screens a horizontal swipe on the sheet moves to the next or previous section. On phones (768px wide or less) the toolbar takes two rows, the header shows the character's name with species, class, level, and subclass and a Details button that reveals the name, species, background, alignment, level, class, and subclass fields, and Armor Class, Initiative, Speed, and Temp HP share one row above Hit Points. The Main tab on phones shows one of three views at a time: Abilities & Skills (proficiency bonus, passive Perception, abilities, saves, skills, and proficiencies), Combat (inspiration, death saves, hit dice, attacks, and defenses), or Features. The chosen view is remembered in the browser, and swiping steps through the views before moving to the next tab. Class and level are dropdowns; choosing a Player's Handbook class, level, or an Eldritch Knight/Arcane Trickster subclass fills the maximum spell slots (and Warlock Pact Magic slot count and level) from the 2024 class tables, and the maximums stay editable for multiclassing. `public/js/character-rules.js` also derives proficiency bonus, ability modifiers, saving throws, skills (proficiency, expertise, and Jack of All Trades, applied automatically for Bards from level 2 or with a feature of that name), passive Perception, initiative (plus proficiency with an Alert or Reactive feature), spellcasting ability, spell save DC and attack bonus, hit dice, and fixed-average maximum HP from class, level, and ability scores; changing class also sets saving throw proficiencies. Values a player typed that differ from the calculation are kept and highlighted until cleared. Skill proficiency dots cycle none, proficient, and expertise; expertise is stored in `uiState.skillExpertise`. The sheet toolbar provides Short Rest and Long Rest buttons: a short rest restores Pact Magic slots and Short Rest feature resources; a long rest restores all HP, spent hit dice, all spell slots, and Short Rest and Long Rest feature resources, clears temporary HP and death saves, and reduces exhaustion by 1, removing the Exhaustion condition when it reaches 0. Both update live state only; custom resource types are left unchanged. The overview page shows the shared Materra calendar (`public/js/calendar.js`). Previous and Next step the date a day at a time, the month, week, and day buttons add or remove travel time, and "Set exact date" picks any year, month (including Intercalis in leap years and Aenaris), and day. Picked dates are previewed until Save Date stores them in the campaign state, and correcting the date this way leaves days traveled unchanged. A "Show calendar" checkbox hides the calendar in this browser (`localStorage` key `mythicalBlueCalendarHidden`), leaving Days Traveled with −/+ day buttons on the overview and only the days traveled in the character sheet's calendar bar.

### `/home.html`

File: `public/home.html`

A static landing page for logged-in users. `public/js/home.js` fetches `GET /api/me`, `GET /api/campaigns?owned=1`, and `GET /api/characters?owned=1` to show campaigns and characters for the user identified by the `user` cookie, even when the user is an admin. Campaign cards link to `/dm-screen.html` only when `campaign.dm` matches the logged-in user ID returned by `/api/me`. If those APIs return `401`, the page redirects to `/login.html`.

### `/characters.html`

File: `public/characters.html`

A static character roster. `public/js/characters.js` fetches `GET /api/characters?owned=1`, renders only characters owned by the logged-in user with sheet metadata, and redirects unauthenticated users to `/login.html`. This strict ownership filter also applies to admin users.

### `/character.html?id={id}`

File: `public/character.html`

A static character detail page. `public/js/character-detail.js` loads current configuration and history through the character API using the `id` query parameter. When history contains an older version, the top toolbar provides Undo. `GET /character.html?id={id}&version={uuidv7}` previews that historical configuration with current live state; Undo can step to older versions, Back to Current removes the preview, and Save writes the preview as a new current version. The toolbar can copy the visible current or historical configuration into a new character while retaining the current owner and campaign and resetting live state. Successful detail-page saves reload the page so the toolbar immediately reflects the latest Undo target and a query-string signal displays the save toast.

### `/dm-screen.html`

File: `public/dm-screen.html`

The DM screen. It supports campaign calendar state, initiative and encounter tools, SRD statblock browsing, and custom campaign statblocks through the statblock API. In the initiative tracker, the combatant whose turn it is is listed first and the order rotates with each turn, with a marker where the next round begins. A pinned turn bar shows the round and current turn with Previous and Next Turn buttons. "Roll NPC Initiative" rolls d20 plus the statblock initiative bonus for NPCs without initiative (players are never rolled), and an "Auto-roll new NPCs" option rolls for NPCs as they are added. Players can be marked absent, which removes them from the turn order and lists them below the tracker to bring back. Concentration is shown with a lit badge and a "Concentrating" tag. Tracker state, including absent players and the auto-roll option, is kept in the browser. Statblocks use a classic two-column layout when there is room: name, type, Armor Class, Hit Points, Speed, the ability table, saving throws, skills, defenses, senses, languages, and challenge on the left; traits and the Actions, Bonus Actions, Reactions, Legendary Actions, and Lair Actions sections on the right. The NPC search matches the start of any word in a name, so "gob" finds goblins. The custom statblock builder has fields for each part of the statblock, per-ability saving throws (filled from the modifier and proficiency bonus, or typed by the DM), and a list per section where each entry has a name and a description, shown in a live preview. Pasting several "Name. Description" lines into an entry name splits them into entries. "Import .monster file" fills the builder from a monster saved by the Tetra-cube statblock generator (tetra-cube.com/dnd/dnd-statblock.html). Custom statblocks are still saved as `text` for the statblock API, one entry per line; a line starting with a name followed by "." or ":" begins a new entry, and other lines (such as spell lists) are indented paragraphs of the entry above.

### `/login.html`

File: `public/login.html`

A static login page. It submits credentials to `POST /api/login`; successful login sets the `user` cookie and redirects to `/`.

The page links to `/forgot-password.html` to request a password reset.

### `/forgot-password.html`

File: `public/forgot-password.html`

A static password-reset request page. It submits the requested email to `POST /api/password-reset/request`; the response does not disclose whether that email is registered. The server sends a 30-minute single-use link using the configured Gmail account.

### `/reset-password.html?token={token}`

File: `public/reset-password.html`

A static set-password page. It validates the query token through `POST /api/password-reset/validate` before showing the password form, then submits the new password to `POST /api/password-reset/confirm`. The page removes the token from the visible URL after reading it.

### `/register.html`

File: `public/register.html`

A static registration page. Registration posts user data to `POST /api/register` and redirects to `/login.html`.

### `/admin/users.html`

File: `public/admin/users.html`

A static admin page. `public/admin/users.js` fetches admin-only `GET /api/admin/users` to list users and the current user summary. Admins can edit user details, toggle enabled status, and optionally set a new password through `PUT /api/admin/users/{id}`.

### `/admin/characters.html`

File: `public/admin/characters.html`

A static admin page. `public/admin/characters.js` fetches admin-only `GET /api/admin/characters` to list characters, link to character sheets, assign or clear ownership, and delete characters.

### `/admin/versions.html?id={id}`

File: `public/admin/versions.html`

A static admin page. `public/admin/versions.js` fetches admin-only `GET /api/admin/characters/{id}/history`, displays saved versions newest-first, and links each version to `/character.html?id={id}&version={versionId}` for preview.

### `/admin/campaigns.html`

File: `public/admin/campaigns.html`

A static admin page. `public/admin/campaigns.js` fetches admin-only `GET /api/admin/campaigns` to list campaigns loaded from `campaign/index.json` and the full `campaign/{id}.json` records, including DM and player names resolved from user IDs and controls to assign or clear those users. Admins can create a named campaign from this page with `POST /api/admin/campaigns`; new campaigns start with the default calendar, zero travel days, and no assigned DM or players.
