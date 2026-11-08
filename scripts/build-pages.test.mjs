import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';

const root = new URL('../dist/pages/', import.meta.url);
test('combined Pages artifact has the landing page and isolated portal', async () => {
  const landing = await readFile(new URL('index.html', root), 'utf8');
  const portal = await readFile(new URL('portal/index.html', root), 'utf8');
  assert.match(landing, /href="\/portal\/"/);
  assert.match(portal, /<base href="\/portal\/"/);
  assert.match(portal, /<app-root>/);
  assert.equal(await readFile(new URL('CNAME', root), 'utf8'), 'devkraken.xyz\n');
  const entries = await readdir(root);
  for (const forbidden of ['server', '.git', '.env', 'tests', 'README.md']) assert.ok(!entries.includes(forbidden));
});
test('HTML assets resolve from their published paths', async () => {
  for (const page of ['index.html', 'privacy.html', 'portal/index.html']) {
    const url = new URL(page, root);
    const html = await readFile(url, 'utf8');
    for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
      const pathname = reference.split(/[?#]/)[0];
      if (!pathname) continue;
      const asset = pathname.startsWith('/') ? new URL(pathname.slice(1), root) : new URL(pathname, url);
      await access(asset);
    }
  }
});
