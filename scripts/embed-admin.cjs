// Keep the Worker pasteable as one module while editing the dashboard as normal HTML.
const fs = require('node:fs');
const path = require('node:path');
const { translateAdmin } = require('./translate-admin.cjs');
const root = path.resolve(__dirname, '..');
const worker = path.join(root, 'cloudflare/worker.mjs');
const html = fs.readFileSync(path.join(root, 'cloudflare/admin.html'), 'utf8').replace(/\r\n/g, '\n');
const source = fs.readFileSync(worker, 'utf8');
if (!/^const ADMIN_HTML = .*;$/m.test(source)) throw Error('Missing embedded dashboard');
let updated = source.replace(/^const ADMIN_HTML = .*;$/m, () => 'const ADMIN_HTML = ' + JSON.stringify(html) + ';');
const english = 'const ADMIN_HTML_EN = ' + JSON.stringify(translateAdmin(html)) + ';';
updated = /^const ADMIN_HTML_EN = .*;$/m.test(updated)
  ? updated.replace(/^const ADMIN_HTML_EN = .*;$/m, () => english)
  : updated + '\n' + english + '\n';
// The Worker is pasted as one file, so the shared nickname policy is inlined between markers.
const policy = fs.readFileSync(path.join(root, 'verification/name-policy.mjs'), 'utf8').replace(/\r\n/g, '\n').replace(/^export /gm, '').trim();
const policyBlock = /^\/\/ BEGIN name-policy[^\n]*\n[\s\S]*?^\/\/ END name-policy/m;
if (!policyBlock.test(updated)) throw Error('Missing name-policy markers in cloudflare/worker.mjs');
updated = updated.replace(policyBlock, block => block.split('\n')[0].trimEnd() + '\n' + policy + '\n// END name-policy');
fs.writeFileSync(worker, updated);
