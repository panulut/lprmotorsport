const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const text = { nodeValue: 'KIERROS', parentElement: { closest: () => false } };
const buttons = ['fi', 'en', 'fi', 'en'].map(language => ({
  dataset: { language }, attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
  addEventListener(type, handler) { this[type] = handler; }
}));
const nickname = {
  attributes: { placeholder: 'Nimimerkki' },
  hasAttribute(name) { return name in this.attributes; },
  getAttribute(name) { return this.attributes[name]; },
  setAttribute(name, value) { this.attributes[name] = value; }
};
const storage = new Map();
const context = {
  window: { dispatchEvent() {} }, Event: class { constructor(type) { this.type = type; } }, NodeFilter: { SHOW_TEXT: 4 },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  document: {
    documentElement: {}, body: {},
    querySelectorAll: selector => selector === '[data-language]' ? buttons : [nickname],
    createTreeWalker: () => { let seen = false; return { currentNode: text, nextNode() { if (seen) return false; seen = true; return true; } }; }
  }
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '../i18n.js'), 'utf8');
vm.runInContext(source, context);
const i18n = context.window.LPRI18n;
assert.deepEqual(buttons.map(button => button.attributes['aria-pressed']), ['true', 'false', 'true', 'false']);
buttons[3].click(); // The startup dialog must work before starting a driving session.
assert.equal(storage.get('lpr-language'), 'en');
assert.deepEqual(buttons.map(button => button.attributes['aria-pressed']), ['false', 'true', 'false', 'true']);
assert.equal(text.nodeValue, 'LAP');
assert.equal(nickname.attributes.placeholder, 'Nickname');
assert.equal(context.document.documentElement.lang, 'en');
assert.equal(i18n.t('PITO OK'), 'GRIP OK');
assert.equal(i18n.t('Aino: Ovi kiinni!'), 'Aino: Close the door!');
assert.equal(i18n.t('record', { time: '00:12.345' }), 'NEW RECORD · 00:12.345');
assert.equal(i18n.t('Yhdistetty: USB Wheel · 3 akselia, 8 painiketta'), 'Connected: USB Wheel · 3 axes, 8 buttons');
assert.equal(i18n.t('Tallennettu: ratti keskelle.'), 'Saved: center the wheel.');
buttons[0].click();
assert.equal(text.nodeValue, 'KIERROS');
assert.equal(nickname.attributes.placeholder, 'Nimimerkki');
assert.equal(i18n.t('Aino: Close the door!'), 'Aino: Ovi kiinni!');
assert.equal(i18n.t('NEW RECORD · 00:12.345'), 'UUSI ENNÄTYS · 00:12.345');
assert.equal(i18n.t('Saved: center the wheel.'), 'Tallennettu: ratti keskelle.');
i18n.setLanguage('en');
vm.runInContext(source, context);
assert.equal(context.window.LPRI18n.language, 'en');
console.log('PASS: language switching, live messages, captions, calibration, and persistence');
