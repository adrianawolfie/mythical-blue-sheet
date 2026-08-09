# AGENTS.md

## Coding Guidance

- Make the smallest possible changes that satisfy the request.
- Prefer small inline changes over introducing helper functions.
- In templates, render required data directly instead of adding fallback branches for missing fields; missing required data should be visible during development.
- Prefer server-side rendered templates for page UI.
- Big update requests should show a toast; when using templates, use a query string to signal the toast after redirect/reload.

## Architecture Guidance

- Read the Project Spec section in this file and the relevant files in `spec/` before making architecture, API, storage, or frontend page changes.
- Keep the relevant files in `spec/` updated when adding or changing API domains, HTTP routes, storage boundaries, or HTML pages.
- Keep architecture and implementation patterns consistent with the existing codebase.
- Prefer adding new behavior through the same package boundaries already in use.
- Keep storage access in repository packages and HTTP request handling in server packages.
- New API behavior should be described by the owning domain package/repository and implemented over HTTP in `pkg/server`.
- New frontend pages should be documented in `spec/README.md` and should follow the existing server-rendered template/static asset patterns.
- Reuse existing route, repository, and JSON response patterns before introducing new abstractions.

## Project Spec

The project spec is split across these files:

- `spec/README.md` describes the application overview, API architecture, HTTP server, and HTML frontend pages.
- `spec/character.md` describes the Character domain.
- `spec/campaign.md` describes the Campaign domain.
- `spec/statblock.md` describes the Statblock domain.
- `spec/user.md` describes the User domain.
- `spec/storage.md` describes the Storage boundary.
