# API changes

Shape changes to the section 4 contract go here so the UI can keep up.

- Initial version. Every GET wraps its payload in a named key: `{cards}`, `{proposal}`, `{proposals}`, `{proposalId, responses}`, `{plan}`, `{events}`, `{scoreboard}`. Empty states return `null` / `[]` with 200, never 404. Full table in `API.md`.
- Extras beyond the spec: `GET /api/proposals` (all versions), `GET /api/health`, `POST /api/scoreboard` (admin, written by eval), `GET /api/log?since=<seq>` for incremental polling.
- `GET /api/proposals/current` returns the latest proposal even after it is `agreed` or `failed`, so the UI can still show it.
