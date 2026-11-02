(() => {
  'use strict';
  const labels = new Map([
    ['arrowleft', '←'], ['arrowright', '→'], ['a', 'A'], ['d', 'D'],
    ['arrowup', '↑'], ['w', 'W'], ['arrowdown', '↓'], ['s', 'S']
  ]);
  const caps = [...document.querySelectorAll('.keycap')];
  const pressed = new Set();
  const editable = element => element instanceof HTMLElement &&
    (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
  function render() {
    for (const cap of caps) cap.classList.toggle('is-pressed', pressed.has(cap.textContent.trim()));
  }
  function clear() {
    if (!pressed.size) return;
    pressed.clear();
    render();
  }
  document.addEventListener('keydown', event => {
    const label = labels.get(event.key.toLowerCase());
    if (!label || editable(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    pressed.add(label);
    render();
  });
  document.addEventListener('keyup', event => {
    const label = labels.get(event.key.toLowerCase());
    if (!label) return;
    pressed.delete(label);
    render();
  });
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
})();
