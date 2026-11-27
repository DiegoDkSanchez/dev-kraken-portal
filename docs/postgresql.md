# PostgreSQL 17

The `postgres` service stores sandbox data in the Docker volume `postgres-local` under the `kraken-local` Compose project. It does not publish port 5432 to your host, so an existing local PostgreSQL installation can keep running.

Internal connection settings: host `postgres`, database/user `kraken_local`, password `local-only-password`. These credentials are only for this local sandbox.

```sh
docker compose -f compose.local.yaml logs postgres
# Open psql inside Docker; use \q to exit:
docker compose -f compose.local.yaml exec postgres psql -U kraken_local -d kraken_local
```

Migrations run automatically when the API starts. Data survives container restarts and `docker compose -f compose.local.yaml down`.

To recreate the database and demo records, follow [Start over](README.md#start-over). That reset deletes this sandbox's uploads too, because attachments are stored in PostgreSQL. It does not reset Cloud SQL or the volume used by the original `compose.yaml`.

For automated backend checks, use the separate `kraken_test` database described in [testing](testing.md). Do not point reset or test commands at a production database.
