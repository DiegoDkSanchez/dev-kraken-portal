import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db.js";
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString("hex");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, hash) {
  if (!hash) return false;
  const [salt, key] = hash.split(":");
  const derived = await scrypt(password, salt, 64);
  return timingSafeEqual(Buffer.from(key, "hex"), derived);
}
export const safeUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  title: u.title,
});
export async function authenticate(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer /, "");
  if (!raw) return res.status(401).json({ error: "Sign in required" });
  const { rows } = await query(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL",
    [digest(raw)],
  );
  if (!rows[0]) return res.status(401).json({ error: "Session expired" });
  req.user = safeUser(rows[0]);
  next();
}
export const roles =
  (...allowed) =>
  (req, res, next) =>
    allowed.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Permission denied" });
export async function hasProject(db, user, id) {
  if (user.role === "admin") return true;
  return !!(
    await db.query(
      "SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2",
      [id, user.id],
    )
  ).rowCount;
}
export async function audit(db, { projectId, ticketId, user, action, label }) {
  await db.query(
    "INSERT INTO history(project_id,ticket_id,actor_id,actor_label,action) VALUES($1,$2,$3,$4,$5)",
    [
      projectId || null,
      ticketId || null,
      user?.id || null,
      label || user?.name || null,
      action,
    ],
  );
}
