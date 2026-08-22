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
- `spec/user.md` describes the User domain.
- `spec/storage.md` describes the Storage boundary.

## HTTP Server

Entrypoint: `bin/main.go`

The server loads configuration, selects storage, creates repositories, registers page and API routes on `http.ServeMux`, limits POST body size, and listens on port `8080`.

Static assets and static HTML are served from `public/` by the root file server. For paths without an extension, the file server tries the path with `.html` before the original path. Explicit page routes in `pkg/server` are limited to redirects; page data is loaded through JSON APIs.

## HTML Frontend

The frontend uses static HTML, CSS, and JavaScript. Dynamic page data is loaded from JSON APIs. Page variables use query parameters rather than path segments.

All page CSS lives in static CSS files under `public/css/` or another served CSS path. Pages should link only the CSS files they need. Pages should not use `<style>` blocks or `style` attributes; add or reuse classes in CSS files instead.

Use Lucide icons for application icons. Prefer self-hosted or inline Lucide SVG markup over external icon CDNs.

Logged-in pages load `public/css/account.css` and `public/js/account.js` to show a fixed top-right account button using a Lucide-style user icon. The shared account overlay fetches `GET /api/me` and submits `PUT /api/me` so users can change their display name and optionally set a new password. Theme selection and text-size controls live in the account overlay instead of the individual page headers.

### `/`

File: `public/index.html`

The main character sheet application. It supports editing character details, stats, spells, features, inventory, journal notes, and live status data.

### `/home.html`

File: `public/home.html`

A static landing page for logged-in users. `public/js/home.js` fetches `GET /api/me`, `GET /api/campaigns?owned=1`, and `GET /api/characters?owned=1` to show campaigns and characters for the user identified by the `user` cookie, even when the user is an admin. Campaign cards link to `/dm-screen.html` only when `campaign.dm` matches the logged-in user ID returned by `/api/me`. If those APIs return `401`, the page redirects to `/login.html`.

### `/characters.html`

File: `public/characters.html`

A static character roster. `public/js/characters.js` fetches `GET /api/characters?owned=1`, renders only characters owned by the logged-in user with sheet metadata, and redirects unauthenticated users to `/login.html`. This strict ownership filter also applies to admin users.

### `/character.html?id={id}`

File: `public/character.html`

A static character detail page. `public/js/character-detail.js` loads current configuration and history through the character API using the `id` query parameter. When history contains an older version, the top toolbar provides Undo. `GET /character.html?id={id}&version={uuidv7}` previews that historical configuration with current live state; Undo can step to older versions, Back to Current removes the preview, and Save writes the preview as a new current version. Successful detail-page saves reload the page so the toolbar immediately reflects the latest Undo target and a query-string signal displays the save toast.

### `/dm-screen.html`

File: `public/dm-screen.html`

The DM screen. It supports campaign calendar state, initiative and encounter tools, SRD statblock browsing, and custom campaign statblocks through the statblock API.

### `/login.html`

File: `public/login.html`

A static login page. It submits credentials to `POST /api/login`; successful login sets the `user` cookie and redirects to `/`.

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

A static admin page. `public/admin/campaigns.js` fetches admin-only `GET /api/admin/campaigns` to list campaigns loaded from `campaign/index.json` and the full `campaign/{id}.json` records, including DM and player names resolved from user IDs and controls to assign or clear those users.
