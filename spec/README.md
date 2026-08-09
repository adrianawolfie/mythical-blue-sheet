# Project Spec

## Overview

Mythical Blue Sheet is a Go HTTP server with a plain HTML, CSS, and JavaScript frontend. The server exposes JSON API routes for persisted campaign data and serves server-rendered or static HTML pages from `public/`.

The application has three main package boundaries:

- Domain packages in `pkg/<domain>` define application data and repository behavior.
- HTTP handlers in `pkg/server` implement the API and page routes.
- Storage implementations in `pkg/storage` provide file/object access for repositories.

## API Architecture

Each API domain owns the types and repository methods that describe the domain. HTTP handlers call those domain repositories instead of reading or writing storage directly.

Repositories are decoupled from concrete storage through the `storage.Storage` interface. The application can use local filesystem storage or S3 storage without changing domain or server handler code.

The API is the HTTP server implementation of those domain repositories. Keep HTTP parameter decoding, request decoding, response encoding, redirects, cookies, and template execution in `pkg/server`. Keep storage paths, JSON persistence, validation, normalization, authorization lookups, cross-repository coordination, and domain rules in the owning repository package. When a domain rule requires data from another domain, the owning repository accepts an interface dependency on the other repository.

## API Domains

- `spec/character.md` describes the Character domain.
- `spec/campaign.md` describes the Campaign domain.
- `spec/statblock.md` describes the Statblock domain.
- `spec/user.md` describes the User domain.
- `spec/storage.md` describes the Storage boundary.

## HTTP Server

Entrypoint: `bin/main.go`

The server loads configuration, selects storage, creates repositories, registers page and API routes on `http.ServeMux`, limits POST body size, and listens on port `8080`.

Static assets and static HTML are served from `public/` by the root file server. Explicit page routes in `pkg/server` may render templates or redirect before the static file server handles other paths.

## HTML Frontend

The frontend uses plain HTML, CSS, and JavaScript. Prefer server-side rendered templates for page UI when adding or changing pages.

All page CSS lives in static CSS files under `public/css/` or another served CSS path. Pages should link only the CSS files they need. Pages and templates should not use `<style>` blocks or `style` attributes; add or reuse classes in CSS files instead.

### `/`

File: `public/index.html`

The main character sheet application. It supports editing character details, stats, spells, features, inventory, journal notes, accessibility controls, and live status data.

### `/home.html`

File: `public/home.html`

A static landing page for logged-in users. `public/js/home.js` fetches `GET /api/me`, `GET /api/campaigns?mine=1`, and `GET /api/characters?mine=1` to show campaigns and characters for the user identified by the `user` cookie. Campaign cards link to `/dm-screen.html` only when `campaign.dm` matches the logged-in user ID returned by `/api/me`. If those APIs return `401`, the page redirects to `/login`.

### `/characters`

Template: `public/characters/list.html`

A server-rendered list of characters owned by the logged-in user. Unauthenticated users are redirected to `/login`.

### `/characters/{id}`

Template: `public/characters/detail.html`

A server-rendered character detail page. The server loads the requested character and embeds its JSON into the page for frontend behavior.

### `/dm-screen.html`

File: `public/dm-screen.html`

The DM screen. It supports campaign calendar state, initiative and encounter tools, SRD statblock browsing, and custom campaign statblocks through the statblock API.

### `/login`

Template: `public/login.html`

The login page. Successful login sets the `user` cookie and redirects to `/`.

### `/register`

Template: `public/register.html`

The registration page. Registration posts user data to `POST /users`.

### `/admin/users`

Template: `public/admin/users.html`

An admin-only page that lists users and the current user summary.

### `/admin/characters`

Template: `public/admin/characters.html`

An admin-only page that lists characters, shows ownership, and supports assigning characters to users.

### `/admin/campaigns`

Template: `public/admin/campaigns.html`

An admin-only page that lists campaigns loaded from `campaign/index.json` and the full `campaign/{id}.json` records, including player names resolved from user IDs and controls to add or remove players.
