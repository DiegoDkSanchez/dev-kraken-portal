import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { pool, query, transaction } from "./db.js";
import {
  authenticate,
  roles,
  hasProject,
  audit,
  token,
  digest,
  hashPassword,
  verifyPassword,
  safeUser,
} from "./auth.js";
import { sendMail } from "./mail.js";
import { estimatePDF } from "./pdf.js";
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) =>
      cb(
        null,
        !origin ||
          (process.env.CORS_ORIGINS || "http://localhost:4200")
            .split(",")
            .includes(origin),
      ),
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const authLimit = rateLimit({
  windowMs: 900000,
  limit: 25,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const text = z.string().trim().min(1).max(200);
const id = z.uuid();
const password = z.string().min(12).max(128);
const role = z.enum(["admin", "developer", "client"]);
const states = z.enum(["backlog", "active", "in_review", "solved", "closed"]);
const url = z
  .url()
  .refine((s) => /^https?:\/\//i.test(s), "Use an HTTP or HTTPS link");
const ticketSchema = z
  .object({
    title: text,
    description: z.string().max(20000).default(""),
    acceptance_criteria: z.string().max(20000).default(""),
    links: z.array(url).max(20).default([]),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    assignee_id: id.nullable().default(null),
  })
  .strict();
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
async function projectAccess(user, projectId, db = pool) {
  id.parse(projectId);
  const { rows } = await db.query("SELECT * FROM projects WHERE id=$1", [
    projectId,
  ]);
  if (!rows[0] || !(await hasProject(db, user, projectId)))
    fail(404, "Project not found");
  return rows[0];
}
async function ticketAccess(user, ticketId, db = pool) {
  id.parse(ticketId);
  const { rows } = await db.query("SELECT * FROM tickets WHERE id=$1", [
    ticketId,
  ]);
  if (!rows[0]) fail(404, "Ticket not found");
  await projectAccess(user, rows[0].project_id, db);
  return rows[0];
}
async function estimateAccess(user, estimateId, db = pool) {
  if (user.role === "developer") fail(403, "Permission denied");
  id.parse(estimateId);
  const { rows } = await db.query("SELECT * FROM estimates WHERE id=$1", [
    estimateId,
  ]);
  if (!rows[0]) fail(404, "Estimate not found");
  await projectAccess(user, rows[0].project_id, db);
  if (
    user.role === "client" &&
    (rows[0].client_email !== user.email || rows[0].status === "draft")
  )
    fail(404, "Estimate not found");
  return rows[0];
}
async function validateAssignee(db, projectId, assignee) {
  if (!assignee) return;
  const { rows } = await db.query(
    "SELECT 1 FROM users u WHERE u.id=$1 AND (u.role='admin' OR (u.role='developer' AND EXISTS(SELECT 1 FROM project_members WHERE user_id=u.id AND project_id=$2)))",
    [assignee, projectId],
  );
  if (!rows.length) fail(400, "Assignee must belong to this project");
}
const publicEstimate = (e) => {
  const { approval_hash, ...safe } = e;
  return safe;
};
app.get("/api/health", async (req, res) => {
  await query("SELECT 1");
  res.json({ status: "ok" });
});
app.post("/api/auth/login", authLimit, async (req, res) => {
  const input = z
    .object({ email: z.email(), password: z.string().max(128) })
    .parse(req.body);
  const { rows } = await query("SELECT * FROM users WHERE email=$1", [
    input.email.toLowerCase(),
  ]);
  if (
    !rows[0] ||
    !(await verifyPassword(input.password, rows[0].password_hash))
  )
    fail(401, "Invalid email or password");
  const raw = token();
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [digest(raw), rows[0].id],
  );
  res.json({ token: raw, user: safeUser(rows[0]) });
});
app.post("/api/auth/accept-invitation", authLimit, async (req, res) => {
  const input = z
    .object({ token: z.string().length(64), password, name: text })
    .parse(req.body);
  const result = await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
      [digest(input.token)],
    );
    const invitation = rows[0];
    if (!invitation) fail(400, "Invitation expired or already used");
    const existing = await db.query("SELECT 1 FROM users WHERE email=$1", [
      invitation.email,
    ]);
    if (existing.rowCount) fail(409, "An account already exists");
    const { rows: users } = await db.query(
      "INSERT INTO users(email,name,role,title,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [
        invitation.email,
        input.name,
        invitation.role,
        invitation.title,
        await hashPassword(input.password),
      ],
    );
    await db.query(
      "INSERT INTO project_members(project_id,user_id) SELECT project_id,$1 FROM invitation_projects WHERE invitation_id=$2 ON CONFLICT DO NOTHING",
      [users[0].id, invitation.id],
    );
    await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
      invitation.id,
    ]);
    return safeUser(users[0]);
  });
  res.status(201).json(result);
});
app.get("/api/approval/:token", authLimit, async (req, res) => {
  z.string().length(64).parse(req.params.token);
  const { rows } = await query(
    "SELECT e.*,p.name project_name,p.client_name FROM estimates e JOIN projects p ON p.id=e.project_id WHERE approval_hash=$1 AND e.status IN ('sent','approved')",
    [digest(req.params.token)],
  );
  if (!rows[0]) fail(404, "Estimate link unavailable");
  res.json(publicEstimate(rows[0]));
});
app.get("/api/approval/:token/pdf", authLimit, async (req, res) => {
  z.string().length(64).parse(req.params.token);
  const { rows } = await query(
    "SELECT e.*,p.name project_name,p.client_name FROM estimates e JOIN projects p ON p.id=e.project_id WHERE approval_hash=$1 AND e.status IN ('sent','approved')",
    [digest(req.params.token)],
  );
  if (!rows[0]) fail(404, "Estimate link unavailable");
  res
    .type("pdf")
    .attachment(`DEV-KRAKEN-EST-${rows[0].number}.pdf`)
    .send(
      await estimatePDF(rows[0], {
        name: rows[0].project_name,
        client_name: rows[0].client_name,
      }),
    );
});
app.post("/api/approval/:token", authLimit, async (req, res) => {
  z.string().length(64).parse(req.params.token);
  const { name } = z
    .object({ name: text, accepted: z.literal(true) })
    .parse(req.body);
  await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT * FROM estimates WHERE approval_hash=$1 AND status='sent' FOR UPDATE",
      [digest(req.params.token)],
    );
    if (!rows[0]) fail(409, "Estimate is unavailable or already approved");
    await db.query(
      "UPDATE estimates SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2",
      [name, rows[0].id],
    );
    await audit(db, {
      projectId: rows[0].project_id,
      label: `${name} (${rows[0].client_email})`,
      action: `Approved EST-${rows[0].number}`,
    });
  });
  res.json({ status: "approved" });
});
app.use("/api", authenticate);
app.get("/api/auth/me", (req, res) => res.json(req.user));
app.post("/api/auth/logout", async (req, res) => {
  await query("DELETE FROM sessions WHERE token_hash=$1", [
    digest(req.headers.authorization.replace(/^Bearer /, "")),
  ]);
  res.sendStatus(204);
});
app.get("/api/projects", async (req, res) => {
  const { rows } = await query(
    "SELECT p.*, (SELECT count(*)::int FROM tickets WHERE project_id=p.id) ticket_count, (SELECT count(*)::int FROM tickets WHERE project_id=p.id AND status IN ('solved','closed')) completed_count FROM projects p WHERE $1='admin' OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$2) ORDER BY p.created_at DESC",
    [req.user.role, req.user.id],
  );
  res.json(rows);
});
app.post("/api/projects", roles("admin"), async (req, res) => {
  const input = z
    .object({
      name: text,
      client_name: text,
      description: z.string().max(20000).default(""),
    })
    .strict()
    .parse(req.body);
  const result = await transaction(async (db) => {
    const { rows } = await db.query(
      "INSERT INTO projects(name,client_name,description,created_by) VALUES($1,$2,$3,$4) RETURNING *",
      [input.name, input.client_name, input.description, req.user.id],
    );
    await audit(db, {
      projectId: rows[0].id,
      user: req.user,
      action: "Created project",
    });
    return rows[0];
  });
  res.status(201).json(result);
});
app.patch("/api/projects/:id/status", roles("admin"), async (req, res) => {
  const { status } = z
    .object({ status: z.enum(["active", "closed"]) })
    .strict()
    .parse(req.body);
  const result = await transaction(async (db) => {
    await projectAccess(req.user, req.params.id, db);
    await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [
      req.params.id,
    ]);
    if (
      status === "active" &&
      !(
        await db.query(
          "SELECT 1 FROM estimates WHERE project_id=$1 AND status='approved'",
          [req.params.id],
        )
      ).rowCount
    )
      fail(409, "Client approval is required before activation");
    const { rows } = await db.query(
      "UPDATE projects SET status=$1 WHERE id=$2 RETURNING *",
      [status, req.params.id],
    );
    await audit(db, {
      projectId: req.params.id,
      user: req.user,
      action: `Moved project to ${status}`,
    });
    return rows[0];
  });
  res.json(result);
});
app.get("/api/projects/:id/members", async (req, res) => {
  await projectAccess(req.user, req.params.id);
  res.json(
    (
      await query(
        "SELECT u.id,u.name,u.role,u.title FROM users u WHERE u.role='admin' OR EXISTS(SELECT 1 FROM project_members m WHERE m.user_id=u.id AND m.project_id=$1) ORDER BY u.name",
        [req.params.id],
      )
    ).rows,
  );
});
app.post("/api/projects/:id/members", roles("admin"), async (req, res) => {
  await projectAccess(req.user, req.params.id);
  const { user_id } = z.object({ user_id: id }).parse(req.body);
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO project_members(project_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.params.id, user_id],
    );
    await audit(db, {
      projectId: req.params.id,
      user: req.user,
      action: "Added project member",
    });
  });
  res.sendStatus(204);
});
app.get("/api/projects/:id/history", async (req, res) => {
  await projectAccess(req.user, req.params.id);
  res.json(
    (
      await query(
        "SELECT h.*,coalesce(u.name,h.actor_label,'System') actor_name FROM history h LEFT JOIN users u ON u.id=h.actor_id WHERE project_id=$1 AND ($2!='developer' OR ticket_id IS NOT NULL) ORDER BY created_at DESC LIMIT 100",
        [req.params.id, req.user.role],
      )
    ).rows,
  );
});
app.get("/api/projects/:id/tickets", async (req, res) => {
  await projectAccess(req.user, req.params.id);
  res.json(
    (
      await query(
        "SELECT t.*,u.name assignee_name,(SELECT count(*)::int FROM comments WHERE ticket_id=t.id) comment_count,(SELECT count(*)::int FROM assets WHERE ticket_id=t.id) asset_count FROM tickets t LEFT JOIN users u ON u.id=t.assignee_id WHERE project_id=$1 ORDER BY t.number",
        [req.params.id],
      )
    ).rows,
  );
});
app.post("/api/projects/:id/tickets", roles("admin"), async (req, res) => {
  const input = ticketSchema.parse(req.body);
  const result = await transaction(async (db) => {
    const p = await projectAccess(req.user, req.params.id, db);
    if (p.status !== "active")
      fail(409, "Activate the project before adding tickets");
    await validateAssignee(db, p.id, input.assignee_id);
    const { rows } = await db.query(
      "INSERT INTO tickets(project_id,title,description,acceptance_criteria,links,priority,assignee_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *",
      [
        p.id,
        input.title,
        input.description,
        input.acceptance_criteria,
        JSON.stringify(input.links),
        input.priority,
        input.assignee_id,
        req.user.id,
      ],
    );
    await audit(db, {
      projectId: p.id,
      ticketId: rows[0].id,
      user: req.user,
      action: "Created ticket",
    });
    return rows[0];
  });
  res.status(201).json(result);
});
app.get("/api/tickets/:id", async (req, res) => {
  const ticket = await ticketAccess(req.user, req.params.id);
  const [comments, assets, history] = await Promise.all([
    query(
      "SELECT c.*,u.name author_name FROM comments c JOIN users u ON u.id=c.author_id WHERE ticket_id=$1 ORDER BY created_at",
      [ticket.id],
    ),
    query(
      "SELECT id,name,mime,size,created_at FROM assets WHERE ticket_id=$1",
      [ticket.id],
    ),
    query(
      "SELECT h.*,coalesce(u.name,h.actor_label,'System') actor_name FROM history h LEFT JOIN users u ON u.id=h.actor_id WHERE ticket_id=$1 ORDER BY created_at DESC",
      [ticket.id],
    ),
  ]);
  res.json({
    ...ticket,
    comments: comments.rows,
    assets: assets.rows,
    history: history.rows,
  });
});
app.patch("/api/tickets/:id", roles("admin"), async (req, res) => {
  const input = ticketSchema.parse(req.body);
  const result = await transaction(async (db) => {
    const ticket = await ticketAccess(req.user, req.params.id, db);
    await validateAssignee(db, ticket.project_id, input.assignee_id);
    const { rows } = await db.query(
      "UPDATE tickets SET title=$1,description=$2,acceptance_criteria=$3,links=$4,priority=$5,assignee_id=$6,updated_by=$7,updated_at=now() WHERE id=$8 RETURNING *",
      [
        input.title,
        input.description,
        input.acceptance_criteria,
        JSON.stringify(input.links),
        input.priority,
        input.assignee_id,
        req.user.id,
        ticket.id,
      ],
    );
    await audit(db, {
      projectId: ticket.project_id,
      ticketId: ticket.id,
      user: req.user,
      action: "Updated ticket details",
    });
    return rows[0];
  });
  res.json(result);
});
app.patch(
  "/api/tickets/:id/status",
  roles("admin", "developer"),
  async (req, res) => {
    const { status, expected_status } = z
      .object({ status: states, expected_status: states })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      const ticket = await ticketAccess(req.user, req.params.id, db);
      const project = await projectAccess(req.user, ticket.project_id, db);
      if (project.status !== "active") fail(409, "Project is not active");
      const result = await db.query(
        "UPDATE tickets SET status=$1,updated_by=$2,updated_at=now() WHERE id=$3 AND status=$4",
        [status, req.user.id, ticket.id, expected_status],
      );
      if (!result.rowCount) fail(409, "Ticket changed. Refresh and try again.");
      await audit(db, {
        projectId: ticket.project_id,
        ticketId: ticket.id,
        user: req.user,
        action: `Moved ${expected_status.replace("_", " ")} → ${status.replace("_", " ")}`,
      });
    });
    res.sendStatus(204);
  },
);
app.post(
  "/api/tickets/:id/comments",
  roles("admin", "client"),
  async (req, res) => {
    const { body } = z
      .object({ body: z.string().trim().min(1).max(10000) })
      .parse(req.body);
    await transaction(async (db) => {
      const ticket = await ticketAccess(req.user, req.params.id, db);
      await db.query(
        "INSERT INTO comments(ticket_id,author_id,body) VALUES($1,$2,$3)",
        [ticket.id, req.user.id, body],
      );
      await db.query(
        "UPDATE tickets SET updated_by=$1,updated_at=now() WHERE id=$2",
        [req.user.id, ticket.id],
      );
      await audit(db, {
        projectId: ticket.project_id,
        ticketId: ticket.id,
        user: req.user,
        action: "Added a comment",
      });
    });
    res.sendStatus(201);
  },
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
app.post(
  "/api/tickets/:id/assets",
  roles("admin", "client"),
  async (req, res, next) => {
    await ticketAccess(req.user, req.params.id);
    next();
  },
  upload.single("file"),
  async (req, res) => {
    if (!req.file) fail(400, "Choose a file");
    await transaction(async (db) => {
      const t = await ticketAccess(req.user, req.params.id, db);
      await db.query(
        "INSERT INTO assets(ticket_id,name,mime,size,data,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          t.id,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.file.buffer,
          req.user.id,
        ],
      );
      await db.query(
        "UPDATE tickets SET updated_by=$1,updated_at=now() WHERE id=$2",
        [req.user.id, t.id],
      );
      await audit(db, {
        projectId: t.project_id,
        ticketId: t.id,
        user: req.user,
        action: `Uploaded ${req.file.originalname}`,
      });
    });
    res.sendStatus(201);
  },
);
app.get("/api/assets/:id", async (req, res) => {
  id.parse(req.params.id);
  const { rows } = await query("SELECT * FROM assets WHERE id=$1", [
    req.params.id,
  ]);
  if (!rows[0]) fail(404, "Asset not found");
  await ticketAccess(req.user, rows[0].ticket_id);
  res
    .attachment(rows[0].name)
    .type("application/octet-stream")
    .send(rows[0].data);
});
app.get("/api/estimates", roles("admin", "client"), async (req, res) => {
  const { rows } = await query(
    "SELECT e.*,p.name project_name,p.client_name FROM estimates e JOIN projects p ON p.id=e.project_id WHERE $1='admin' OR (e.client_email=$2 AND e.status!='draft' AND EXISTS(SELECT 1 FROM project_members WHERE project_id=p.id AND user_id=$3)) ORDER BY e.created_at DESC",
    [req.user.role, req.user.email, req.user.id],
  );
  res.json(rows.map(publicEstimate));
});
app.post("/api/estimates", roles("admin"), async (req, res) => {
  const input = z
    .object({
      project_id: id,
      title: text,
      client_email: z.email(),
      currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
      notes: z.string().max(10000).default(""),
      items: z
        .array(
          z
            .object({
              description: text,
              quantity: z.number().positive().max(100000),
              rate: z.number().nonnegative().max(1000000),
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict()
    .parse(req.body);
  const result = await transaction(async (db) => {
    await projectAccess(req.user, input.project_id, db);
    const { rows } = await db.query(
      "INSERT INTO estimates(project_id,title,client_email,currency,items,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [
        input.project_id,
        input.title,
        input.client_email.toLowerCase(),
        input.currency,
        JSON.stringify(input.items),
        input.notes,
        req.user.id,
      ],
    );
    await audit(db, {
      projectId: input.project_id,
      user: req.user,
      action: `Created EST-${rows[0].number}`,
    });
    return rows[0];
  });
  res.status(201).json(publicEstimate(result));
});
app.get(
  "/api/estimates/:id/pdf",
  roles("admin", "client"),
  async (req, res) => {
    const estimate = await estimateAccess(req.user, req.params.id);
    const project = await projectAccess(req.user, estimate.project_id);
    res
      .type("pdf")
      .attachment(`DEV-KRAKEN-EST-${estimate.number}.pdf`)
      .send(await estimatePDF(estimate, project));
  },
);
app.post("/api/estimates/:id/send", roles("admin"), async (req, res) => {
  await transaction(async (db) => {
    const e = await estimateAccess(req.user, req.params.id, db);
    await db.query("SELECT id FROM estimates WHERE id=$1 FOR UPDATE", [e.id]);
    const current = (
      await db.query("SELECT status FROM estimates WHERE id=$1", [e.id])
    ).rows[0];
    if (current.status === "approved")
      fail(409, "Estimate is already approved");
    const p = await projectAccess(req.user, e.project_id, db);
    const raw = token();
    const link = `${process.env.APP_URL}/#approve=${raw}`;
    await sendMail({
      to: e.client_email,
      subject: `DEV KRAKEN · ${e.title}`,
      text: `${p.client_name},\n\nYour estimate for ${p.name} is ready.\nReview, download and approve: ${link}\n\nDEV KRAKEN`,
      attachments: [
        {
          filename: `EST-${e.number}.pdf`,
          content: await estimatePDF({ ...e, status: "sent" }, p),
        },
      ],
    });
    await db.query(
      "UPDATE estimates SET status='sent',approval_hash=$1 WHERE id=$2",
      [digest(raw), e.id],
    );
    await audit(db, {
      projectId: p.id,
      user: req.user,
      action: `Sent EST-${e.number} to ${e.client_email}`,
    });
  });
  res.json({ status: "sent" });
});
app.post("/api/estimates/:id/approve", roles("client"), async (req, res) => {
  await transaction(async (db) => {
    const e = await estimateAccess(req.user, req.params.id, db);
    const result = await db.query(
      "UPDATE estimates SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2 AND status='sent'",
      [req.user.name, e.id],
    );
    if (!result.rowCount)
      fail(409, "Estimate is unavailable or already approved");
    await audit(db, {
      projectId: e.project_id,
      user: req.user,
      action: `Approved EST-${e.number}`,
    });
  });
  res.json({ status: "approved" });
});
app.get("/api/team", roles("admin"), async (req, res) =>
  res.json({
    users: (
      await query("SELECT id,email,name,role,title FROM users ORDER BY name")
    ).rows,
    invitations: (
      await query(
        "SELECT id,email,name,role,title,expires_at,accepted_at FROM invitations WHERE accepted_at IS NULL ORDER BY created_at DESC",
      )
    ).rows,
  }),
);
app.post("/api/invitations", roles("admin"), async (req, res) => {
  const input = z
    .object({
      email: z.email(),
      name: text,
      role,
      title: z.string().max(100).default(""),
      project_ids: z.array(id).max(100).default([]),
    })
    .strict()
    .parse(req.body);
  await transaction(async (db) => {
    if (
      (
        await db.query("SELECT 1 FROM users WHERE email=$1", [
          input.email.toLowerCase(),
        ])
      ).rowCount
    )
      fail(409, "An account already exists");
    for (const pid of input.project_ids) await projectAccess(req.user, pid, db);
    const raw = token();
    const { rows } = await db.query(
      "INSERT INTO invitations(email,name,role,title,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '7 days',$6) RETURNING id",
      [
        input.email.toLowerCase(),
        input.name,
        input.role,
        input.title,
        digest(raw),
        req.user.id,
      ],
    );
    for (const pid of input.project_ids)
      await db.query(
        "INSERT INTO invitation_projects(invitation_id,project_id) VALUES($1,$2)",
        [rows[0].id, pid],
      );
    await sendMail({
      to: input.email,
      subject: "Your DEV KRAKEN invitation",
      text: `${input.name},\n\nJoin DEV KRAKEN as ${input.role}:\n${process.env.APP_URL}/#invite=${raw}\n\nThis invitation expires in 7 days.`,
    });
  });
  res.status(201).json({ status: "invited" });
});
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
  if (err instanceof multer.MulterError)
    return res.status(400).json({ error: "Upload one file, up to 5 MB" });
  if (err.code === "23505")
    return res.status(409).json({ error: "This record already exists" });
  if (err.code === "23503")
    return res.status(400).json({ error: "Related record not found" });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error("Request failed", err.code || err.name);
  res.status(500).json({ error: "Unable to complete request" });
});
export default app;
