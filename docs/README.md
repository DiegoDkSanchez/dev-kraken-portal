# Local Docker development

Run commands from the repository root. Install Docker Desktop, or Docker Engine with the Compose v2 plugin, and start Docker. No host Node, npm, Angular CLI, PostgreSQL, or SMTP installation is needed.

## First start

```sh
docker compose -f compose.local.yaml up --build -d --wait
# Run once on a fresh local database:
docker compose -f compose.local.yaml exec -e ALLOW_DEMO_SEED=true -e DEMO_PASSWORD=Local-demo-password-123 api npm run db:seed
```

Open http://localhost:4200. Sign in with `admin@kraken.local`, `alex@kraken.local` (developer), or `client@kraken.local`, using `Local-demo-password-123`. These are fictional local accounts. The seed refuses to run when users already exist.

| Technology | Guide | Local address |
| --- | --- | --- |
| Docker Compose | [Docker](docker.md) | Container lifecycle |
| Angular / Node.js | [Frontend](angular.md) | http://localhost:4200 |
| Express / Node.js | [Backend](express.md) | http://localhost:4000/api/health |
| PostgreSQL | [Database](postgresql.md) | Internal Docker network only |
| Mailpit / SMTP | [Email](mailpit.md) | http://localhost:8025 |

See [testing](testing.md) for existing automated checks and manual scenarios.

## Everyday use

```sh
docker compose -f compose.local.yaml up -d --wait
docker compose -f compose.local.yaml logs -f api web
# Stop and remove containers; keep database data:
docker compose -f compose.local.yaml down
```

Source changes are visible through read-only bind mounts. Angular polls for changes; Node watches backend source. If the backend does not reload on your Docker filesystem, run `docker compose -f compose.local.yaml restart api`.

## Start over

**This deletes all data in this Docker sandbox**, including users, uploads, projects, estimates, and history. Use it when you want to repeat a scenario from scratch.

```sh
docker compose -f compose.local.yaml down --volumes
docker compose -f compose.local.yaml up --build -d --wait
docker compose -f compose.local.yaml exec -e ALLOW_DEMO_SEED=true -e DEMO_PASSWORD=Local-demo-password-123 api npm run db:seed
```

The dedicated Compose project is `kraken-local`. Its database volume is separate from the older `compose.yaml` environment. Use the explicit `-f compose.local.yaml` in every command; do not merge the two Compose files.

## Isolation

The stack sets local database and SMTP addresses explicitly. It does not load the repository `.env`, mount cloud credentials, or connect to Cloud SQL. Browser configuration is overridden with a local API address. Only loopback ports 4200, 4000, and 8025 are published. Open the site using `localhost` to match CORS and email links.

Dependencies are installed with the committed lockfile inside the image. Host `node_modules`, Node versions, and lockfiles are not modified by startup. Images, build cache, and database volumes do consume local disk and memory. The first build needs internet access to download images and npm packages.
