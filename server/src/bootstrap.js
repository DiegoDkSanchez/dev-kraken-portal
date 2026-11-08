import { query, pool } from "./db.js";
import { token, digest } from "./auth.js";
import { sendMail } from "./mail.js";
import { migrate } from "./migrate.js";
await migrate();
const email = process.env.OWNER_EMAIL || "diegodksanchez@gmail.com";
if ((await query("SELECT 1 FROM users WHERE role='admin'")).rowCount)
  throw new Error(
    "An administrator already exists. Use invitations in the portal.",
  );
const raw = token();
await query(
  "INSERT INTO invitations(email,name,role,title,token_hash,expires_at) VALUES($1,'Diego Sánchez','admin','Founder',$2,now()+interval '7 days')",
  [email, digest(raw)],
);
await sendMail({
  to: email,
  subject: "Set up DEV KRAKEN",
  text: `Set your administrator password:\n${process.env.APP_URL}/#invite=${raw}\n\nExpires in 7 days.`,
});
console.log("Owner invitation sent");
await pool.end();
