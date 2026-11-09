const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function estimateEmail(estimate, project, link) {
  const url = new URL(link);
  if (!['http:', 'https:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('Estimate email links must use HTTPS in production');
  }
  const reference = `EST-${estimate.number}`;
  const total = new Intl.NumberFormat('en-US', {style:'currency', currency:estimate.currency || 'USD'}).format(
    estimate.items.reduce((sum, item) => sum + Math.round(item.quantity * item.rate * 100) / 100, 0));
  const subject = `DEV KRAKEN | Estimate ${reference} for ${project.name}`.replace(/[\r\n]+/g, ' ');
  const text = `Dear ${project.client_name},

Thank you for considering DEV KRAKEN for ${project.name}.

Please find attached estimate ${reference}: ${estimate.title}.
Estimated total: ${total}

Review the full scope, download a copy, and approve the estimate through your private project link:
${link}

Please review the details before approving. For questions or changes, contact your DEV KRAKEN project representative.

Kind regards,
The DEV KRAKEN team

DEV KRAKEN
Project estimates and client services
This email concerns the estimate for ${project.name}. The review link is private; share it only with authorized project contacts.
`;
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(reference)} | DEV KRAKEN</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f6f8;color:#243247;font-family:Arial,Helvetica,sans-serif;line-height:1.6">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce2e8">
<tr><td style="padding:24px 32px;background:#011f4b;color:#fff;font-size:20px;font-weight:bold">DEV KRAKEN</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 24px;font-size:24px">Your project estimate</h1>
<p>Dear ${e(project.client_name)},</p>
<p>Thank you for considering DEV KRAKEN for <strong>${e(project.name)}</strong>.</p>
<p>Please find attached your estimate for review.</p>
<table width="100%" cellspacing="0" cellpadding="8" style="background:#f4f6f8;text-align:left">
<tr><th scope="row">Reference</th><td>${e(reference)}</td></tr>
<tr><th scope="row">Estimate</th><td>${e(estimate.title)}</td></tr>
<tr><th scope="row">Estimated total</th><td>${e(total)}</td></tr></table>
<p>Review the full scope, download a copy, and approve the estimate through your private project link.</p>
<p style="margin:28px 0"><a href="${e(link)}" style="display:inline-block;padding:12px 20px;background:#011f4b;color:#fff;text-decoration:none;font-weight:bold;border-radius:4px">Review estimate ${e(reference)}</a></p>
<p style="font-size:13px">If the button does not work, open this link:<br><a href="${e(link)}" style="color:#115e9b;word-break:break-all">${e(link)}</a></p>
<p>Please review the details before approving. For questions or changes, contact your DEV KRAKEN project representative.</p>
<p>Kind regards,<br>The DEV KRAKEN team</p>
</td></tr><tr><td style="padding:24px 32px;border-top:1px solid #dce2e8;color:#526176;font-size:12px">
<strong>DEV KRAKEN</strong><br>Project estimates and client services
<p>This email concerns the estimate for ${e(project.name)}. The review link is private; share it only with authorized project contacts.</p>
</td></tr></table></td></tr></table></body></html>`;
  return {subject, text, html};
}
