# Docker Compose

Configuration: `compose.local.yaml`. Development image: `docker/Dockerfile.local`. The production Dockerfile and original database-only Compose configuration remain separate.

Check Docker and inspect the resolved configuration:

```sh
docker version
docker compose version
docker compose -f compose.local.yaml config
docker compose -f compose.local.yaml up --build -d --wait
docker compose -f compose.local.yaml ps
```

PostgreSQL must pass its readiness check before the API starts. The API runs migrations on startup and must become healthy before Angular starts. `--wait` also waits for the frontend health check.

The image contains Node 24 and locked npm dependencies. Source directories are mounted read-only; generated build output and Angular cache stay in the container. The Dockerfile-specific ignore file restricts the build context and excludes host dependencies and environment files.

After a package manifest or lockfile changes:

```sh
docker compose -f compose.local.yaml up --build -d --wait
```

This reinstalls dependencies in the image, without running npm on your computer. Dependency upgrades are a separate deliberate change; startup uses `npm ci`.

If startup fails, inspect `docker compose -f compose.local.yaml logs api web postgres`. A port collision means another process is using 4200, 4000, or 8025; stop that process or the older stack. If changing ports, also update API CORS, APP_URL, and `docker/config.local.js` consistently.

`down` preserves database data. `down --volumes` deletes this sandbox's database. Neither command removes unrelated Docker projects. Avoid global Docker prune commands to clean up this project.

References: [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) and [Docker build contexts](https://docs.docker.com/build/concepts/context/).
