import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { estimateEmail } from '../src/estimate-email.js';
const estimate = {number:42,title:'Development <scope>',currency:'USD',items:[{quantity:2,rate:125.50}]};
const project = {name:'Client portal',client_name:'Client & Partners <script>alert(1)</script>'};
const link = 'https://devkraken.xyz/portal/#approve=private-token';
test('estimate email escapes content and preserves review link, total, and reference', () => {
  const email = estimateEmail(estimate, project, link);
  assert.match(email.html, /Client &amp; Partners &lt;script&gt;/);
  assert.ok(!email.html.includes('<script>'));
  assert.match(email.html, /Development &lt;scope&gt;/);
  for (const body of [email.text,email.html]) {
    for (const value of [link,'$251.00','DEV KRAKEN','EST-42']) assert.ok(body.includes(value));
  }
  assert.ok(!estimateEmail(estimate,{...project,name:'Hello\r\nBcc: other'},link).subject.includes('\n'));
  assert.throws(() => estimateEmail(estimate,project,'javascript:alert(1)'));
});
test('production estimate links require HTTPS', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => estimateEmail(estimate,project,'http://example.com/'));
    assert.ok(estimateEmail(estimate,project,link).html);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test('email serializes with HTML, plain text, and PDF attachment', async () => {
  const transport = nodemailer.createTransport({streamTransport:true,buffer:true});
  const result = await transport.sendMail({
    from:'DEV KRAKEN <portal@example.com>',to:'client@example.com',
    ...estimateEmail(estimate,project,link),
    attachments:[{filename:'EST-42.pdf',content:Buffer.from('%PDF-test')}],
  });
  const raw = result.message.toString();
  for (const type of ['multipart/alternative','text/plain','text/html','application/pdf']) assert.ok(raw.includes(type));
});
