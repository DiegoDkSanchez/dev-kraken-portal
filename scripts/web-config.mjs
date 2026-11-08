import { writeFile } from "node:fs/promises";
const url = new URL(process.env.API_URL || "");
if (url.protocol !== "https:")
  throw new Error("Production API_URL must use HTTPS");
await writeFile(
  "web/public/config.js",
  `window.KRAKEN_CONFIG = ${JSON.stringify({ apiUrl: url.href.replace(/\/$/, "") })};\n`,
);
