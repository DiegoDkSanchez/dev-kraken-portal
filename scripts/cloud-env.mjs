// JSON is valid YAML and safely preserves punctuation in configuration values.
const env = process.env;
if (!env.APP_URL || !env.CLOUD_SQL_CONNECTION)
  throw new Error("APP_URL and CLOUD_SQL_CONNECTION are required");
const appUrl = new URL(env.APP_URL);
if (appUrl.protocol !== "https:")
  throw new Error("Production APP_URL must use HTTPS");
console.log(
  JSON.stringify(
    {
      NODE_ENV: "production",
      PGHOST: `/cloudsql/${env.CLOUD_SQL_CONNECTION}`,
      PGDATABASE: "kraken",
      PGUSER: "kraken",
      APP_URL: env.APP_URL.replace(/\/$/, ""),
      CORS_ORIGINS: appUrl.origin,
      OWNER_EMAIL: "diegodksanchez@gmail.com",
      SMTP_HOST: env.SMTP_ENABLED === "false" ? "" : env.SMTP_HOST,
      SMTP_PORT: env.SMTP_PORT || "587",
      SMTP_USER: env.SMTP_USER,
      MAIL_FROM: env.MAIL_FROM,
      MAIL_REPLY_TO: env.MAIL_REPLY_TO || "",
    },
    null,
    2,
  ),
);
