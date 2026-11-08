import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

// Publish an explicit allowlist, never repository metadata or backend files.
const output = new URL('../dist/pages/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'privacy.html', 'styles.css', 'script.js', 'catalog.js', 'contact-api.js', 'assets']) {
  await cp(new URL(`../landing/${name}`, import.meta.url), new URL(name, output), { recursive: true });
}
await cp(new URL('../dist/portal/browser/', import.meta.url), new URL('portal/', output), { recursive: true });
await writeFile(new URL('.nojekyll', output), '');
await writeFile(new URL('CNAME', output), 'devkraken.xyz\n');
