const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { launchBrowser } = require('../scripts/browser.cjs');
const { translateAdmin } = require('../scripts/translate-admin.cjs');

(async () => {
  const worker = (await import('../cloudflare/worker.mjs')).default;
  const source = fs.readFileSync(require.resolve('../cloudflare/admin.html'), 'utf8').replace(/\r\n/g, '\n');
  const browser = await launchBrowser({ headless: true });
  try {
    for (const language of ['fi', 'en']) {
      const response = await worker.fetch(new Request('https://admin.test/admin?lang=' + language), {});
      const html = await response.text();
      assert.equal(html, language === 'en' ? translateAdmin(source) : source, 'embedded page is up to date');
      new vm.Script(html.split('<script>')[1].split('</script>')[0]);
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const now = Date.now(), hash = 'abcdef0123456789';
      await page.route('https://admin.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/admin') return route.fulfill({ contentType: 'text/html', body: html });
        assert.equal(route.request().headers().authorization, 'Bearer ' + 'a'.repeat(32));
        const totals = { players: 1, sessions: 2, active_ms: 60000, first_seen: now, last_seen: now };
        const counters = { capacityRejected: 1, startRateRejected: 0, practiceLaps: 2, processingTimeouts: 0, lagTerminations: 0 };
        const fixtures = {
          '/api/verified/admin/laps': {results:[]},
          '/api/verified/admin/chat': { guestsOpen: true, blocks: [{ player_hash: 'b'.repeat(64), nickname: 'Häiritsijä', created_ms: now }],
            messages: [{ id: '00000000-0000-4000-8000-000000000000', nickname: 'Päivä', text: 'Hei <b>kaikki</b>', at: now, player_hash: 'c'.repeat(64), blocked: false }] },
          '/api/admin/summary': { totals, daily: [{ day: '2026-10-26', ...totals }], states: [{ state: 'driving', ms: 60000 }], devices: [{ device: 'desktop', sessions: 2 }], players: [{ nickname: 'Päivä', player_hash: hash, ...totals }] },
          '/api/admin/capacity-history': { totals: { lastReportAt: now, ...counters }, daily: [], since: now },
          '/api/admin/capacity': { activeSessions: 1, maxSessions: 10, counters, since: now, observedAt: now },
          '/api/admin/laps': { results: [{ id: 1, nickname: 'Päivä', player_hash: hash, lap_ms: 60000, sector1: 20000, sector2: 20000, sector3: 20000 }] },
          '/api/admin/player': { totals, events: [{ at: now, kind: 'state_change', state: 'driving', nickname: 'Päivä', metadata: JSON.stringify({ device: 'desktop', browser: 'Chrome', os: 'Windows', width: 1280, height: 800, language: 'fi' }), version: 'v1', session_id: hash }] }
        };
        return route.fulfill({ json: fixtures[url.pathname] });
      });
      await page.goto('https://admin.test/admin?lang=' + language);
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.equal(await page.locator('a[lang="en"]').getAttribute('href'), '?lang=en');
      await page.locator('#token').fill('a'.repeat(32));
      await page.locator('#login button').click();
      await page.locator('#laps table').waitFor();
      assert.equal(await page.locator('#token').inputValue(), '');
      assert.match(await page.locator('#states').textContent(), language === 'en' ? /Driving/ : /Ajaminen/);
      await page.locator('#chat-admin table').waitFor();
      assert.match(await page.locator('#chat-admin').textContent(), language === 'en' ? /Writer.*Message.*Delete message.*Block writer/ : /Kirjoittaja.*Viesti.*Poista viesti.*Estä kirjoittaja/);
      assert.match(await page.locator('#chat-admin').textContent(), /Hei <b>kaikki<\/b>/, 'chat text is shown as text, not markup, and is not translated');
      assert.equal(await page.locator('#chat-admin b').count(), 0);
      assert.match(await page.locator('#chat-blocks').textContent(), language === 'en' ? /Häiritsijä.*Lift block/ : /Häiritsijä.*Pura esto/);
      const chatDialog = page.waitForEvent('dialog');
      const chatClick = page.locator('#chat-admin button').first().click();
      const chatConfirmation = await chatDialog;
      assert.match(chatConfirmation.message(), language === 'en' ? /^Delete this message/ : /^Poistetaanko tämä viesti/);
      await chatConfirmation.dismiss(); await chatClick;
      await page.locator('#players button').click();
      await page.locator('#events table').waitFor();
      assert.match(await page.locator('#events').textContent(), language === 'en' ? /State changed/ : /Tilan vaihto/);
      assert.match(await page.locator('#events').textContent(), /Päivä/, 'player data is not translated');
      const dialog = page.waitForEvent('dialog');
      const click = page.locator('#delete-player').click();
      const confirmation = await dialog;
      assert.match(confirmation.message(), language === 'en' ? /^Delete all analytics/ : /^Poistetaanko/);
      await confirmation.dismiss(); await click;
      await page.locator('#logout').click();
      assert.equal(await page.locator('#status').textContent(), language === 'en' ? 'Statistics locked.' : 'Tilastot lukittu.');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: Finnish and English admin routes, login, reports, player data, confirmations and lock');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
