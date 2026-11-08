import app from "./app.js";
import { migrate } from "./migrate.js";
import { pool } from "./db.js";
await migrate();
const server = app.listen(process.env.PORT || 4000, "0.0.0.0", () =>
  console.log(`DEV KRAKEN API listening on ${process.env.PORT || 4000}`),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await pool.end();
    process.exit(0);
  }),
);
