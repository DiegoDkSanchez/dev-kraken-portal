# Angular frontend

The `web` service runs Angular's development server under Node 24 inside Docker. Start the full environment using [the quick start](README.md), then open http://localhost:4200.

```sh
docker compose -f compose.local.yaml logs -f web
# Compile a production frontend build inside the container:
docker compose -f compose.local.yaml exec web npm run build
```

Edit `web/src` on your computer. Angular polls for edits every second and reloads the browser. Public assets, Angular configuration, and TypeScript configuration are also mounted read-only. Build output stays in the container's `/app/dist`; it does not overwrite host files.

`docker/config.local.js` overrides the public API setting inside the container, pointing the browser to `http://localhost:4000/api`, even if the repository public config was changed for deployment. The browser uses localhost; Docker services use internal names such as `postgres` and `mail`.

No global Angular CLI or host npm installation is needed. Rebuild the images after dependency changes. Browser tests are not yet configured for the portal; see [testing](testing.md).
