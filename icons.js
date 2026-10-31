(() => {
  'use strict';
  const names = new Set([
    'arrow-counter-clockwise', 'arrow-left', 'arrow-right', 'arrow-up', 'arrow-up-right', 'caret-left', 'caret-right', 'chat-circle',
    'dots-three', 'eye', 'fire', 'globe', 'medal', 'music-note', 'pause', 'play',
    'speaker-high', 'speaker-slash', 'trophy', 'user', 'robot', 'x', 'check-circle', 'warning', 'info'
  ]);
  const sprite = new URL('assets/phosphor-icons.svg?v=phosphor-regular-2.1.1', document.baseURI).href;
  window.LPRIcon = name => {
    if (!names.has(name)) throw new TypeError(`Unknown Phosphor icon: ${name}`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.classList.add('ph-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    use.setAttribute('href', `${sprite}#${name}`);
    svg.append(use);
    return svg;
  };
})();
