# Local testing

Start the Docker stack first using [the quick start](README.md). All commands below run Node tooling inside containers.

## Existing automated tests

Create a separate test database once per fresh Docker volume:

```sh
docker compose -f compose.local.yaml exec postgres createdb -U kraken_local kraken_test
```

If it already exists, skip that command. Run the backend suite:

```sh
docker compose -f compose.local.yaml exec -e TEST_DATABASE_URL=postgres://kraken_local:local-only-password@postgres:5432/kraken_test api npm test
```

The workflow tests create a unique schema, migrate it, create role accounts, exercise the API, capture SMTP locally, and remove the schema afterward. They do not use your manually seeded demo projects. Supplying TEST_DATABASE_URL is necessary; otherwise the database integration suite skips.

Build and check the combined landing/portal output in a disposable container:

```sh
docker compose -f compose.local.yaml run --rm --no-deps web sh -c 'npm run build:pages && npm run test:pages'
```

This container holds its generated output; no host dependencies or output folders are written. Rebuild images after editing `scripts` or `landing`, which are copied into the image rather than mounted.

## Manual end-to-end checks

1. Log in as admin and create a project, assign members, and create a ticket.
2. In a separate browser session, log in as the assigned developer and move the ticket.
3. Log in as the client and verify the change, add a comment, and upload a file.
4. Send an estimate as admin, inspect Mailpit, and approve as the intended recipient.
5. Create and accept an invitation through Mailpit.
6. Verify an unrelated client cannot access the project.

To repeat consumed invitations or approvals, create fresh records or reset the sandbox using the documented reset. Refreshing a browser does not reset persisted data. Database reset invalidates existing sessions, so sign in again afterward.

## Browser automation scope

This change provides the local Docker environment and commands for existing tests. It does not yet add a Playwright portal suite or install browsers. The existing `landing/tests/browser_checks.py` is a separate landing-page check and is not included in this Node image.

A later portal E2E runner can join this Docker network with its own browser dependencies and isolated test data. Keep it separate from the manual sandbox database so automated resets do not erase your exploratory work.
