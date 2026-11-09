# Estimate email delivery

Reviewed: November 9, 2026.

## Current application solutions

- Formal HTML estimate email with greeting, project name, estimate reference, title, total, review button, fallback link, signature, and DEV KRAKEN footer.
- Matching plain-text content. Inline styles and tables support email clients; no remote images, tracking pixels, or shortened links are used.
- Dynamic HTML values are escaped. Private approval links and PDF attachments remain part of the workflow.
- Production requires HTTPS approval links and encrypted SMTP: implicit TLS on port 465 or mandatory STARTTLS on other ports. Certificate verification stays enabled. Local development can use a plaintext SMTP sink.
- MAIL_FROM and SMTP_HOST are required. Configure a verified branded sender such as `DEV KRAKEN <portal@your-verified-domain>`.
- Optional MAIL_REPLY_TO routes replies to a monitored mailbox. Set it locally or in the GitHub production environment variables; deployment passes it to Cloud Run.
- Nodemailer cannot read local files or fetch URLs for message content. Generated PDF buffers still work. This is content-access hardening, not a spam-filter bypass.

These changes improve clarity and transport configuration. They do not guarantee inbox placement. SMTP acceptance is not proof of inbox delivery.

## Provider and DNS setup still required

Production sender configuration, DNS authentication, recipient message headers, and sending reputation have not been verified during this implementation. A footer cannot repair failed authentication.

1. Confirm the actual MAIL_FROM domain and verify it with the SMTP provider. Use a stable identity and monitored reply mailbox.
2. Publish the provider's SPF configuration for the envelope sender domain. Maintain one SPF record per domain; merge authorized sources rather than creating conflicting records.
3. Enable provider-side DKIM signing and publish the exact selector records supplied by the provider. Do not guess DNS values or selectors.
4. Configure DMARC for the From domain. At least one passing SPF or DKIM identity must align with the From domain. Begin with monitoring if necessary, review reports, and strengthen policy after all legitimate senders are covered. Use a reporting mailbox you control.
5. Confirm the provider manages forward/reverse DNS for sending IPs, uses TLS to recipients, and handles bounces and complaints. Suppress hard-bouncing addresses and recipients who complain instead of repeatedly resending.
6. Send only expected project correspondence. Keep marketing separate, avoid bursts and repeated resends, and monitor reputation through the provider and Google Postmaster Tools when sufficient traffic is available.

Provider-side signing is intentional: the app does not store a DKIM private key or modify DNS. Custom return-path settings must follow provider instructions. Reply-To does not fix authentication alignment.

## Diagnose a message landing in spam

With authorization, send one estimate to a controlled test inbox. In Gmail use **Show original** and inspect Authentication-Results for SPF, DKIM, and DMARC. Compare the visible From domain with the DKIM signing domain and SPF envelope domain. Check the provider delivery/bounce log and receiver spam explanation.

Do not publish private approval links, tokens, credentials, or customer information in tickets or logs. Record redacted authentication results and provider message IDs. Check HTML and plain-text rendering, the PDF, review link, and reply routing.

If authentication passes but messages still land in spam, investigate IP/domain reputation, complaints, sending patterns, recipient expectations, and link reputation with the provider. Formatting alone cannot establish the cause.

The PDF remains part of the existing workflow; removing it is not a guaranteed fix. These are transactional estimates. No nonfunctional unsubscribe link or fabricated authentication headers are added. If marketing or subscription mail is introduced, implement the applicable unsubscribe requirements separately.

## Verification and rollout

Run `npm test` for template and MIME checks. Supply TEST_DATABASE_URL for the full PostgreSQL/SMTP workflow suite. The suite captures mail locally and sends nothing to real recipients. Production requires a TLS-capable SMTP provider.

Deploy the API and optional MAIL_REPLY_TO configuration. No database migration is required for this email change. After deployment, inspect an authorized controlled delivery; local tests cannot measure actual inbox placement.

## References

- [Google sender guidelines](https://support.google.com/mail/answer/81126): authentication, alignment, TLS, reputation, and subscription requirements.
- [Google sender FAQ](https://support.google.com/mail/answer/14229414): delivery errors and sender requirements.
- [Nodemailer SMTP](https://nodemailer.com/smtp): TLS configuration.
- [Nodemailer message configuration](https://nodemailer.com/message): HTML/plain text, reply-to, attachments, and content-access controls.
