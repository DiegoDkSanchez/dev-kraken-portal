import { query, pool, transaction } from "./db.js";
import { hashPassword, audit } from "./auth.js";
import { migrate } from "./migrate.js";
if (
  process.env.NODE_ENV === "production" ||
  process.env.ALLOW_DEMO_SEED !== "true"
)
  throw new Error(
    "Demo seed requires ALLOW_DEMO_SEED=true and is disabled in production",
  );
await migrate();
if ((await query("SELECT 1 FROM users LIMIT 1")).rowCount)
  throw new Error("Seed requires an empty database");
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set DEMO_PASSWORD to at least 12 characters");
await transaction(async (db) => {
  const users = [];
  for (const [name, email, role, title] of [
    ["Diego Sánchez", "admin@kraken.local", "admin", "Founder"],
    ["Alex Rivera", "alex@kraken.local", "developer", "Frontend developer"],
    ["Sofia Chen", "sofia@kraken.local", "developer", "Backend developer"],
    ["Emma Wilson", "client@kraken.local", "client", "Product owner"],
  ]) {
    users.push(
      (
        await db.query(
          "INSERT INTO users(name,email,role,title,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [name, email, role, title, await hashPassword(password)],
        )
      ).rows[0],
    );
  }
  const admin = users[0];
  const p = (
    await db.query(
      "INSERT INTO projects(name,client_name,description,status,created_by) VALUES('Customer platform','Northstar Studio','A connected customer experience, from onboarding to delivery.','active',$1) RETURNING *",
      [admin.id],
    )
  ).rows[0];
  const p2 = (
    await db.query(
      "INSERT INTO projects(name,client_name,description,status,created_by) VALUES('Commerce redesign','Forma Collective','An intuitive storefront and a smoother checkout.','estimated',$1) RETURNING *",
      [admin.id],
    )
  ).rows[0];
  for (const u of users.slice(1))
    await db.query(
      "INSERT INTO project_members(project_id,user_id) VALUES($1,$2)",
      [p.id, u.id],
    );
  const seedTickets = [
    [
      "Build notification preferences",
      "Let customers choose which project updates arrive in their inbox.",
      "Email notifications can be toggled independently\nPreferences persist between sessions",
      "backlog",
      "medium",
      1,
    ],
    [
      "Export project reports",
      "Download a clear summary of milestones, tickets and progress.",
      "Report includes current project status\nDates follow the customer timezone",
      "backlog",
      "low",
      2,
    ],
    [
      "Improve mobile navigation",
      "Keep workspace navigation accessible on smaller screens.",
      "Navigation works at 375px\nActive page is always visible",
      "backlog",
      "medium",
      1,
    ],
    [
      "Create client onboarding flow",
      "A guided welcome for every new client joining the workspace.",
      "Invitation opens the correct workspace\nRequired fields are validated",
      "active",
      "high",
      1,
    ],
    [
      "Connect project activity feed",
      "Show project updates as they happen, with author and timestamp.",
      "Each update records the author\nNewest events appear first",
      "active",
      "medium",
      2,
    ],
    [
      "Review dashboard components",
      "Check spacing, states and accessibility across the dashboard.",
      "Keyboard navigation works\nAll empty states are included",
      "in_review",
      "medium",
      1,
    ],
    [
      "Polish estimate PDF layout",
      "Apply the DEV KRAKEN identity to client-ready estimates.",
      "Totals match the estimate\nLong descriptions wrap correctly",
      "in_review",
      "low",
      2,
    ],
    [
      "Set up role permissions",
      "Keep client, developer and admin access clearly separated.",
      "Developer cannot access estimates\nClient data is isolated by project",
      "solved",
      "high",
      2,
    ],
    [
      "Add project status labels",
      "Make project progress easy to understand at a glance.",
      "Status labels use consistent colors\nAll statuses are readable",
      "solved",
      "low",
      1,
    ],
    [
      "Configure workspace branding",
      "Bring the DEV KRAKEN logo and color palette into the portal.",
      "Provided logo appears in navigation\nNavy and cyan match the palette",
      "closed",
      "medium",
      1,
    ],
    [
      "Set up project repository",
      "Initialize the project structure and development environment.",
      "Frontend and API run locally\nEnvironment variables are documented",
      "closed",
      "low",
      2,
    ],
  ];
  for (const [
    title,
    description,
    criteria,
    status,
    priority,
    assignee,
  ] of seedTickets) {
    const t = (
      await db.query(
        "INSERT INTO tickets(project_id,title,description,acceptance_criteria,status,priority,assignee_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *",
        [
          p.id,
          title,
          description,
          criteria,
          status,
          priority,
          users[assignee].id,
          admin.id,
        ],
      )
    ).rows[0];
    await audit(db, {
      projectId: p.id,
      ticketId: t.id,
      user: admin,
      action: "Created ticket",
    });
    if (status !== "backlog")
      await audit(db, {
        projectId: p.id,
        ticketId: t.id,
        user: users[assignee],
        action: `Moved backlog → ${status.replace("_", " ")}`,
      });
    if (["active", "in_review"].includes(status)) {
      await db.query(
        "INSERT INTO comments(ticket_id,author_id,body) VALUES($1,$2,$3)",
        [
          t.id,
          users[3].id,
          "The direction looks good. Please keep the mobile experience in mind.",
        ],
      );
      await audit(db, {
        projectId: p.id,
        ticketId: t.id,
        user: users[3],
        action: "Added a comment",
      });
    }
  }
  await db.query(
    "INSERT INTO estimates(project_id,title,client_email,currency,items,notes,status,approved_by,approved_at,created_by) VALUES($1,'Customer platform · Phase 1','client@kraken.local','USD',$2,'Four-week delivery. 50% upfront, 50% on completion.','approved','Emma Wilson',now(),$3)",
    [
      p.id,
      JSON.stringify([
        {
          description: "Discovery & interface design",
          quantity: 1,
          rate: 1800,
        },
        { description: "Platform development", quantity: 40, rate: 85 },
      ]),
      admin.id,
    ],
  );
  await db.query(
    "INSERT INTO estimates(project_id,title,client_email,items,notes,created_by) VALUES($1,'Commerce redesign · Discovery','demo-client@example.com',$2,'Two-week discovery phase.',$3)",
    [
      p2.id,
      JSON.stringify([
        { description: "UX audit & discovery", quantity: 1, rate: 1200 },
        { description: "Design system", quantity: 16, rate: 85 },
      ]),
      admin.id,
    ],
  );
  await audit(db, { projectId: p.id, user: admin, action: "Created project" });
});
console.log(
  "Local sample workspace created. Sign in as admin@kraken.local, alex@kraken.local, or client@kraken.local with DEMO_PASSWORD.",
);
await pool.end();
