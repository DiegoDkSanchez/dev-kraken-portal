import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
const database = process.env.TEST_DATABASE_URL;
let pool, app, query, hashPassword, digest, token, smtp;
const messages = [];
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const sessions = {};
let project, otherProject, ticket, estimate, client, developer, outsider;
const password = "Test-portal-password-514023";
const auth = (role) => ({ Authorization: `Bearer ${sessions[role]}` });
const call = () => request(app);
before(async () => {
  if (!database) return;
  const adminPool = new pg.Pool({ connectionString: database });
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  await adminPool.end();
  const parsed = new URL(database);
  parsed.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = parsed.toString();
  process.env.APP_URL = "http://localhost:4200";
  smtp = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP\r\n");
    let buffer = "",
      data = false,
      message = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"),
          line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(message);
            message = "";
            data = false;
            socket.write("250 accepted\r\n");
          } else message += line + "\n";
        } else if (/^EHLO|HELO/.test(line)) socket.write("250 localhost\r\n");
        else if (line === "DATA") {
          data = true;
          socket.write("354 send data\r\n");
        } else if (line === "QUIT") {
          socket.end("221 bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.address().port);
  process.env.MAIL_FROM = "portal@example.com";
  ({ pool, query } = await import("../src/db.js"));
  ({ hashPassword, digest, token } = await import("../src/auth.js"));
  await (await import("../src/migrate.js")).migrate();
  app = (await import("../src/app.js")).default;
  for (const role of ["admin", "developer", "client", "outsider"]) {
    const u = (
      await query(
        "INSERT INTO users(email,name,role,title,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          `${role}@example.com`,
          role,
          role === "outsider" ? "client" : role,
          "Test role",
          await hashPassword(password),
        ],
      )
    ).rows[0];
    if (role === "client") client = u;
    if (role === "developer") developer = u;
    if (role === "outsider") outsider = u;
    const login = await call()
      .post("/api/auth/login")
      .send({ email: u.email, password });
    assert.equal(login.status, 200);
    sessions[role] = login.body.token;
  }
});
after(async () => {
  if (!database) return;
  await pool.end();
  await new Promise((r) => smtp.close(r));
  const cleanup = new pg.Pool({ connectionString: database });
  await cleanup.query(`DROP SCHEMA ${schema} CASCADE`);
  await cleanup.end();
});
test(
  "complete customer portal workflow and access boundaries",
  { skip: !database },
  async (t) => {
    await t.test(
      "requires authentication and rejects invalid passwords",
      async () => {
        assert.equal((await call().get("/api/projects")).status, 401);
        assert.equal(
          (
            await call()
              .post("/api/auth/login")
              .send({ email: "admin@example.com", password: "incorrect" })
          ).status,
          401,
        );
      },
    );
    await t.test(
      "admins create projects; developers and clients cannot",
      async () => {
        const body = {
          name: "Portal",
          client_name: "Client",
          description: "Test project",
        };
        assert.equal(
          (await call().post("/api/projects").set(auth("developer")).send(body))
            .status,
          403,
        );
        assert.equal(
          (await call().post("/api/projects").set(auth("client")).send(body))
            .status,
          403,
        );
        const result = await call()
          .post("/api/projects")
          .set(auth("admin"))
          .send(body);
        assert.equal(result.status, 201);
        project = result.body;
        otherProject = (
          await call()
            .post("/api/projects")
            .set(auth("admin"))
            .send({ ...body, name: "Private project" })
        ).body;
        for (const member of [client, developer])
          assert.equal(
            (
              await call()
                .post(`/api/projects/${project.id}/members`)
                .set(auth("admin"))
                .send({ user_id: member.id })
            ).status,
            204,
          );
      },
    );
    await t.test(
      "project membership isolates clients and developers",
      async () => {
        const visible = await call().get("/api/projects").set(auth("client"));
        assert.equal(visible.body.length, 1);
        assert.equal(
          (
            await call()
              .get(`/api/projects/${otherProject.id}/tickets`)
              .set(auth("client"))
          ).status,
          404,
        );
        assert.equal(
          (
            await call()
              .get(`/api/projects/${project.id}/tickets`)
              .set(auth("outsider"))
          ).status,
          404,
        );
      },
    );
    await t.test("activation requires an approved estimate", async () => {
      assert.equal(
        (
          await call()
            .patch(`/api/projects/${project.id}/status`)
            .set(auth("admin"))
            .send({ status: "active" })
        ).status,
        409,
      );
      assert.equal(
        (
          await call()
            .post(`/api/projects/${project.id}/tickets`)
            .set(auth("admin"))
            .send({ title: "Premature" })
        ).status,
        409,
      );
    });
    await t.test(
      "creates estimates, denies developer access, and hides drafts from clients",
      async () => {
        const result = await call()
          .post("/api/estimates")
          .set(auth("admin"))
          .send({
            project_id: project.id,
            title: "Build portal",
            client_email: client.email,
            currency: "USD",
            items: [{ description: "Development", quantity: 10, rate: 100 }],
          });
        assert.equal(result.status, 201);
        estimate = result.body;
        assert.equal(
          (await call().get("/api/estimates").set(auth("developer"))).status,
          403,
        );
        assert.equal(
          (
            await call()
              .get(`/api/estimates/${estimate.id}/pdf`)
              .set(auth("developer"))
          ).status,
          403,
        );
        assert.equal(
          (await call().get("/api/estimates").set(auth("client"))).body.length,
          0,
        );
      },
    );
    await t.test(
      "downloads real PDF and sends approval email with PDF attachment",
      async () => {
        const pdf = await call()
          .get(`/api/estimates/${estimate.id}/pdf`)
          .set(auth("admin"));
        assert.equal(pdf.status, 200);
        assert.equal(pdf.headers["content-type"], "application/pdf");
        assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
        const sent = await call()
          .post(`/api/estimates/${estimate.id}/send`)
          .set(auth("admin"));
        assert.equal(sent.status, 200);
        assert.equal(messages.length, 1);
        assert.match(messages[0], /application\/pdf/);
        assert.match(messages[0], /client@example.com/);
        assert.equal(
          (await call().get("/api/estimates").set(auth("client"))).body[0]
            .status,
          "sent",
        );
      },
    );
    await t.test(
      "only intended client approves; activation remains an admin action",
      async () => {
        assert.equal(
          (
            await call()
              .post(`/api/estimates/${estimate.id}/approve`)
              .set(auth("outsider"))
          ).status,
          404,
        );
        assert.equal(
          (
            await call()
              .post(`/api/estimates/${estimate.id}/approve`)
              .set(auth("admin"))
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .post(`/api/estimates/${estimate.id}/approve`)
              .set(auth("client"))
          ).status,
          200,
        );
        assert.equal(
          (
            await call()
              .post(`/api/estimates/${estimate.id}/approve`)
              .set(auth("client"))
          ).status,
          409,
        );
        assert.equal(
          (
            await call()
              .patch(`/api/projects/${project.id}/status`)
              .set(auth("developer"))
              .send({ status: "active" })
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .patch(`/api/projects/${project.id}/status`)
              .set(auth("admin"))
              .send({ status: "active" })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "admins create tickets; validates URLs and assigned project membership",
      async () => {
        assert.equal(
          (
            await call()
              .post(`/api/projects/${project.id}/tickets`)
              .set(auth("developer"))
              .send({ title: "Forbidden" })
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .post(`/api/projects/${project.id}/tickets`)
              .set(auth("admin"))
              .send({ title: "Unsafe link", links: ["javascript:alert(1)"] })
          ).status,
          400,
        );
        assert.equal(
          (
            await call()
              .post(`/api/projects/${project.id}/tickets`)
              .set(auth("admin"))
              .send({ title: "Bad assignee", assignee_id: outsider.id })
          ).status,
          400,
        );
        const result = await call()
          .post(`/api/projects/${project.id}/tickets`)
          .set(auth("admin"))
          .send({
            title: "Implement login",
            description: "Invitation only",
            acceptance_criteria: "Secure sessions",
            links: ["https://example.com/spec"],
            priority: "high",
            assignee_id: developer.id,
          });
        assert.equal(result.status, 201);
        ticket = result.body;
      },
    );
    await t.test(
      "developers move tickets but cannot edit details, comment, upload, or see estimates",
      async () => {
        assert.equal(
          (
            await call()
              .patch(`/api/tickets/${ticket.id}`)
              .set(auth("developer"))
              .send({ title: "No" })
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .post(`/api/tickets/${ticket.id}/comments`)
              .set(auth("developer"))
              .send({ body: "No" })
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .post(`/api/tickets/${ticket.id}/assets`)
              .set(auth("developer"))
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .patch(`/api/tickets/${ticket.id}/status`)
              .set(auth("client"))
              .send({ status: "active", expected_status: "backlog" })
          ).status,
          403,
        );
        assert.equal(
          (
            await call()
              .patch(`/api/tickets/${ticket.id}/status`)
              .set(auth("developer"))
              .send({ status: "active", expected_status: "backlog" })
          ).status,
          204,
        );
        assert.equal(
          (
            await call()
              .patch(`/api/tickets/${ticket.id}/status`)
              .set(auth("developer"))
              .send({ status: "solved", expected_status: "backlog" })
          ).status,
          409,
        );
        for (const [from, to] of [
          ["active", "in_review"],
          ["in_review", "solved"],
          ["solved", "closed"],
        ])
          assert.equal(
            (
              await call()
                .patch(`/api/tickets/${ticket.id}/status`)
                .set(auth("developer"))
                .send({ status: to, expected_status: from })
            ).status,
            204,
          );
      },
    );
    await t.test(
      "comments, attachments and audit history persist with authors and dates",
      async () => {
        assert.equal(
          (
            await call()
              .post(`/api/tickets/${ticket.id}/comments`)
              .set(auth("client"))
              .send({ body: "Looks good!" })
          ).status,
          201,
        );
        assert.equal(
          (
            await call()
              .post(`/api/tickets/${ticket.id}/assets`)
              .set(auth("client"))
              .attach("file", Buffer.from("Acceptance document"), {
                filename: "requirements.txt",
                contentType: "text/plain",
              })
          ).status,
          201,
        );
        const detail = await call()
          .get(`/api/tickets/${ticket.id}`)
          .set(auth("client"));
        assert.equal(detail.body.comments[0].author_name, "client");
        assert.equal(detail.body.history.length, 7);
        assert.ok(
          detail.body.history.every((h) => h.actor_name && h.created_at),
        );
        const asset = detail.body.assets[0];
        assert.equal(
          (await call().get(`/api/assets/${asset.id}`).set(auth("outsider")))
            .status,
          404,
        );
        const download = await call()
          .get(`/api/assets/${asset.id}`)
          .set(auth("developer"));
        assert.equal(download.status, 200);
        assert.equal(download.body.toString(), "Acceptance document");
        const history = await call()
          .get(`/api/projects/${project.id}/history`)
          .set(auth("developer"));
        assert.ok(history.body.every((h) => h.ticket_id));
      },
    );
    await t.test(
      "admin invitations send, assign roles and projects, and can only be accepted once",
      async () => {
        assert.equal(
          (
            await call()
              .post("/api/invitations")
              .set(auth("developer"))
              .send({})
          ).status,
          403,
        );
        const result = await call()
          .post("/api/invitations")
          .set(auth("admin"))
          .send({
            email: "partner@example.com",
            name: "Partner",
            role: "admin",
            title: "Co-founder",
            project_ids: [],
          });
        assert.equal(result.status, 201);
        const source = messages.at(-1).replace(/=\n/g, "").replace(/=3D/g, "=");
        const invitation = source.match(/#invite=([a-f0-9]{64})/)?.[1];
        assert.ok(invitation);
        assert.equal(
          (
            await call()
              .post("/api/auth/accept-invitation")
              .send({ token: invitation, name: "Partner", password: "short" })
          ).status,
          400,
        );
        assert.equal(
          (
            await call()
              .post("/api/auth/accept-invitation")
              .send({ token: invitation, name: "Partner", password })
          ).status,
          201,
        );
        assert.equal(
          (
            await call()
              .post("/api/auth/accept-invitation")
              .send({ token: invitation, name: "Partner", password })
          ).status,
          400,
        );
        const login = await call()
          .post("/api/auth/login")
          .send({ email: "partner@example.com", password });
        assert.equal(login.body.user.role, "admin");
        assert.equal(login.body.user.title, "Co-founder");
      },
    );
    await t.test(
      "public approval links support PDF and one approval without leaking token hashes",
      async () => {
        const raw = token();
        const row = (
          await query(
            "INSERT INTO estimates(project_id,title,client_email,items,status,approval_hash) VALUES($1,'Public estimate',$2,$3,'sent',$4) RETURNING id",
            [
              otherProject.id,
              "other@example.com",
              JSON.stringify([
                { description: "Design", quantity: 1, rate: 500 },
              ]),
              digest(raw),
            ],
          )
        ).rows[0];
        const view = await call().get(`/api/approval/${raw}`);
        assert.equal(view.status, 200);
        assert.equal(view.body.approval_hash, undefined);
        assert.equal(
          (await call().get(`/api/approval/${raw}/pdf`)).status,
          200,
        );
        assert.equal(
          (
            await call()
              .post(`/api/approval/${raw}`)
              .send({ name: "Other client", accepted: true })
          ).status,
          200,
        );
        assert.equal(
          (
            await call()
              .post(`/api/approval/${raw}`)
              .send({ name: "Other client", accepted: true })
          ).status,
          409,
        );
        assert.equal(
          (await query("SELECT status FROM estimates WHERE id=$1", [row.id]))
            .rows[0].status,
          "approved",
        );
      },
    );
    await t.test("logout invalidates the server-side session", async () => {
      assert.equal(
        (await call().post("/api/auth/logout").set(auth("developer"))).status,
        204,
      );
      assert.equal(
        (await call().get("/api/auth/me").set(auth("developer"))).status,
        401,
      );
    });
  },
);
