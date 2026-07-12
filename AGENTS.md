# AGENTS.md

## Coding Guidance

- Make the smallest possible changes that satisfy the request.
- Prefer small inline changes over introducing helper functions.

## Architecture Guidance

- Keep architecture and implementation patterns consistent with the existing codebase.
- Prefer adding new behavior through the same package boundaries already in use.
- Keep storage access in repository packages and HTTP request handling in server packages.
- Reuse existing route, repository, and JSON response patterns before introducing new abstractions.
