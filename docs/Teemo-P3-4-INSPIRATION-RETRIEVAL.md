# Teemo P3-4 Inspiration Retrieval

Status: `IMPLEMENTED / WAITING REVIEW`

P3-4 provides local keyword retrieval from active P3-3 metadata snapshots. It supports case-insensitive substring search over `name` and `relativePath`, source and format filters, landscape/portrait/square, minimum width and height, newest/oldest/name sorting, and bounded pagination with a maximum of 100 results per page.

The retrieval layer is Main Process-owned and reuses P3-2 preview. It revalidates the existing Source/P1 authorized-root boundary through the Index Service before exposing metadata. Revoked, removed, corrupt, unindexed, and disabled sources fail closed.

It does not scan source directories for queries, parse image headers, call providers, mutate source bytes, inject Agent Context, create a second index, add new filesystem authorization, or implement P3-5/P3-6 capabilities.

Evidence:

- `npm.cmd run test:inspiration-retrieval`
- `npm.cmd run test:inspiration-retrieval-ui-smoke`
- `npm.cmd run test:inspiration-index-ui-smoke`
- `npm.cmd run test:local-folder-ui-smoke`

No close commit or recovery tag is created before Strict Review.
