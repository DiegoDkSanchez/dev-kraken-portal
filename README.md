# DEV KRAKEN Monorepo

Angular 22 dashboard, Express 5 API, PostgreSQL 17. Branded with the supplied DEV KRAKEN logo and palette: navy `#011F4B`, cyan `#00FFFF`, off-white `#F5F5F5`, slate `#62727B`.

## Applications

- `landing/`: public landing page at https://devkraken.xyz/.
- `web/`: Angular customer portal at https://devkraken.xyz/portal/.
- `server/`: Express API on Cloud Run.

`npm run build:pages` assembles both frontends into `dist/pages`; serve that directory to preview the complete site. `npm run test:pages` checks the published layout and local asset references. The landing page was imported from `DiegoDkSanchez/dev-kraken-web` at commit `9b653a24c77b816fb54adefa080a001ea5b9ddda`.

## Included workflows

- Create projects and itemized USD/EUR/GBP estimates; download branded PDFs.
- Send estimates by SMTP with PDF attachments and private approval links.
- Clients approve via their portal or the emailed link. An admin can activate any project, with or without an estimate, and edit its name, client, description, and status.
- Five ticket states: Backlog → Active → In review → Solved → Closed. Drag cards or use the accessible status selector.
- Tickets include title, description, acceptance criteria, HTTP(S) links, assignee, priority, attachments, comments, and a side panel showing who changed what and when.
- Invitation-only accounts. The first owner is invited using a bootstrap command; subsequent admins are invited by an existing admin.
- Server-enforced role permissions and project membership. Hidden buttons are not the security boundary.

| Capability | Admin | Developer | Client |
| --- | --- | --- | --- |
| View projects/tickets/history | All | Assigned | Assigned |
| Create/edit projects and tickets | Yes | No | No |
| Move ticket state | Yes | Assigned active projects | No |
| View estimates/PDFs | All | No | Own sent/approved estimates |
| Create/send estimates | Yes | No | No |
| Approve estimates | No | No | Intended recipient |
| Comments and attachments | Yes | Read/download only | Assigned tickets |
| Invite users / assign project access | Yes | No | No |

## Local development

Requires Node 24.15+ and PostgreSQL 17; Docker Compose is an optional way to start PostgreSQL and Mailpit.

```sh
npm ci
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run api
# In another terminal:
npm start
```

Set `.env` SMTP_HOST=localhost, SMTP_PORT=1025, MAIL_FROM=portal@kraken.local to use the local Mailpit inbox at http://localhost:8025. Mailpit captures emails locally; it does not deliver them to real recipients. The app opens at http://localhost:4200. Public browser configuration is in `web/public/config.js`; never put secrets there.

To create the first real owner account in a fresh database:

```sh
npm run bootstrap -w server
```

This sends a seven-day invitation to `OWNER_EMAIL` (defaults to `diegodksanchez@gmail.com`). It refuses to run if an admin already exists. SMTP must be configured. There is no default production password or public registration endpoint.

For an isolated, fictional sample workspace instead:

```sh
ALLOW_DEMO_SEED=true DEMO_PASSWORD='choose-a-local-password' npm run db:seed
```

Seed requires an empty database and is disabled when NODE_ENV=production. Local accounts: `admin@kraken.local`, `alex@kraken.local`, `client@kraken.local`. All use the supplied DEMO_PASSWORD. Sample clients, projects, and estimates are fictional and never loaded by deployment.

## Verification

```sh
npm run build
TEST_DATABASE_URL=postgres://kraken:kraken@localhost:5432/kraken_test npm test
npm audit
```

Tests create and clean up a unique PostgreSQL schema. A local SMTP sink verifies mail delivery without sending real mail. The suite covers unauthenticated requests, role restrictions, cross-project isolation, manual activation, project editing and deletion, project file access, PDF generation, email attachments, invitation replay, estimate approval replay, optimistic ticket transitions, comments, asset downloads, audit authors/dates, and session invalidation. Without TEST_DATABASE_URL the integration suite is skipped; CI always supplies it.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). The repository contains GitHub Actions for PR checks and deployment on pushes/merges to `main`:

1. Run PostgreSQL integration tests, build Angular, audit production dependencies.
2. Build and push the API container; deploy to Google Cloud Run in project `devkraken-514023` with Cloud SQL.
3. Check the API health endpoint.
4. Build the Angular frontend with the deployed API URL and correct Pages base path; publish with GitHub Pages.

Terraform provisions Cloud SQL, automatic backups/PITR, Artifact Registry, secrets, dedicated service accounts, and GitHub Workload Identity Federation. No long-lived Google service account key is stored in GitHub.

## Data and security notes

- Passwords use scrypt with per-user salts. Session and invitation secrets are stored as SHA-256 hashes, never plaintext. Sessions expire after 12 hours and are held in browser sessionStorage.
- API access uses bearer tokens, explicit CORS origins, input validation, parameterized SQL, and request throttling. GitHub Pages serves only static frontend assets.
- Each client/developer request checks project membership. Developers cannot access estimates or estimate-related project activity. Status updates require the expected previous state to prevent silent overwrites.
- Attachments are stored durably in PostgreSQL, capped at 5 MB per file, and downloaded as attachment/octet-stream after authorization. They are not rendered inline. No antivirus scanning is included.
- Public estimate links are bearer capabilities: only share them with the intended client. Resending rotates the link. Accepted estimates cannot be resent or approved twice. Approval records the entered name and recipient address; this is an operational approval record, not a verified digital signature.
- Database changes and history entries are transactional. Email uses SMTP; delivery is initiated inside the transaction. SMTP delivery and PostgreSQL commit cannot be atomic: rare delivery/commit failures require resending. A durable outbox is a future improvement for higher email volume.
- The baseline uses one Cloud SQL zone and shared-core sizing; adjust the tier and availability before larger workloads. Cloud Run scales to zero, but Cloud SQL incurs ongoing costs.
- Password recovery, user removal, MFA, billing, and antivirus scanning are outside this initial scope.

Project files support admin/client uploads and downloads by project members (5 MB per file). Admins can permanently delete a project after a confirmation dialog; its tickets, comments, estimates, files, memberships, and project history are removed. Run the database migration before using project files.

Email formatting, deliverability measures, and provider/DNS verification steps: [doc/email-deliverability.md](doc/email-deliverability.md).
