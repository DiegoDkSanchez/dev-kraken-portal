# Express backend and Node.js

The `api` service runs `node --watch server/src/index.js` inside Docker. Startup applies the existing PostgreSQL migrations. Use [the quick start](README.md) to start all dependencies.

```sh
docker compose -f compose.local.yaml logs -f api
# Explicit migration, if needed:
docker compose -f compose.local.yaml exec api npm run db:migrate
```

Health endpoint: http://localhost:4000/api/health. Source edits under `server/src` trigger Node's watcher. Restart with `docker compose -f compose.local.yaml restart api` if file events are not delivered on your machine.

The service uses the local PostgreSQL container and sends SMTP to Mailpit. It does not read your host `.env`. Password hashing, sessions, and role checks use the normal application implementation.

Create demo users on an empty database:

```sh
docker compose -f compose.local.yaml exec -e ALLOW_DEMO_SEED=true -e DEMO_PASSWORD=Local-demo-password-123 api npm run db:seed
```

Alternatively, on a fresh database without demo users, test owner onboarding:

```sh
docker compose -f compose.local.yaml exec api npm run bootstrap -w server
```

Open Mailpit and accept the invitation for `owner@kraken.local`. Bootstrap refuses when an administrator already exists. Choose either demo seeding or owner onboarding for the initial setup.

See [testing](testing.md) to run API tests inside the container.
