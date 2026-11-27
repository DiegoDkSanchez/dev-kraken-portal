# Mailpit email inbox

Mailpit captures local invitation and estimate emails so you can inspect messages, attachments, and approval links without delivering them to customers.

Start the stack with [the quick start](README.md), then open http://localhost:8025. No SMTP provider account is needed.

The backend connects to `mail:1025` on the Docker network. Only the inbox UI is exposed to your computer; SMTP is not published. No SMTP relay is configured.

```sh
docker compose -f compose.local.yaml logs -f mail
```

Invite a fictional user or send a sample estimate through the portal. Find the email in Mailpit and open its link. Links target http://localhost:4200. Use a separate browser profile or private window when testing different roles.

No persistent mail volume is configured; treat messages as disposable. The application database is persisted separately.
