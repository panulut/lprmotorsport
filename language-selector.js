(() => {
  'use strict';
  const selectors = [...document.querySelectorAll('[data-language-selector]')];
  if (!selectors.length) return;

  const language = () => window.LPRI18n?.language || document.documentElement.lang || 'fi';
  const sync = root => {
    const selected = language();
    const trigger = root.querySelector('.language-selector__trigger');
    if (!trigger) return;
    const flag = trigger.querySelector('.language-selector__flag');
    if (flag) {
      const source = `assets/circle-flags-${selected === 'en' ? 'gb' : 'fi'}.svg`;
      if (flag.getAttribute('src') !== source) flag.setAttribute('src', source);
    }
    root.querySelectorAll('[data-language]').forEach(option => {
      const active = option.dataset.language === selected;
      option.setAttribute('aria-checked', String(active));
      option.setAttribute('aria-pressed', String(active));
    });
  };

  const close = (root, restoreFocus = false) => {
    const trigger = root.querySelector('.language-selector__trigger');
    root.classList.remove('is-open', 'language-selector--viewport-menu');
    root.style.removeProperty('--language-menu-left');
    root.style.removeProperty('--language-menu-top');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus();
  };
  const placeViewportMenu = root => {
    if (!root.closest('#left-rail')) return;
    const trigger = root.querySelector('.language-selector__trigger');
    const menu = root.querySelector('.language-selector__menu');
    if (!trigger || !menu) return;
    root.classList.add('language-selector--viewport-menu');
    const anchor = trigger.getBoundingClientRect();
    const width = menu.offsetWidth || 184;
    const height = menu.offsetHeight || 100;
    const gap = 8;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.right - width));
    const below = anchor.bottom + gap;
    const top = below + height <= window.innerHeight - 8
      ? below
      : Math.max(8, Math.min(window.innerHeight - height - 8, anchor.top - height - gap));
    root.style.setProperty('--language-menu-left', `${Math.round(left)}px`);
    root.style.setProperty('--language-menu-top', `${Math.round(top)}px`);
  };
  const open = (root, edge = 'first') => {
    const trigger = root.querySelector('.language-selector__trigger');
    const options = [...root.querySelectorAll('[data-language]')];
    root.classList.add('is-open');
    trigger?.setAttribute('aria-expanded', 'true');
    placeViewportMenu(root);
    options[edge === 'last' ? options.length - 1 : 0]?.focus();
  };

  selectors.forEach(root => {
    const trigger = root.querySelector('.language-selector__trigger');
    const menu = root.querySelector('.language-selector__menu');
    if (!trigger || !menu) return;
    sync(root);
    trigger.addEventListener('click', () => {
      if (root.classList.contains('is-open')) close(root);
      else open(root);
    });
    root.addEventListener('click', event => {
      const option = event.target.closest('[data-language]');
      if (!option || !root.contains(option)) return;
      // The i18n click handler runs on the option before this bubbling handler.
      queueMicrotask(() => {
        selectors.forEach(sync);
        close(root);
        trigger.focus();
      });
    });
    root.addEventListener('keydown', event => {
      const options = [...root.querySelectorAll('[data-language]')];
      const index = options.indexOf(document.activeElement);
      if (event.target === trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        open(root, event.key === 'ArrowUp' ? 'last' : 'first');
        return;
      }
      if (event.key === 'Escape' && root.classList.contains('is-open')) {
        event.preventDefault();
        close(root, true);
        return;
      }
      if (index < 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    });
    root.addEventListener('focusout', event => {
      if (!root.contains(event.relatedTarget)) close(root);
    });
  });

  document.addEventListener('pointerdown', event => {
    selectors.forEach(root => {
      if (!root.contains(event.target)) close(root);
    });
  });
  window.addEventListener('resize', () => selectors.forEach(root => {
    if (root.classList.contains('is-open')) placeViewportMenu(root);
  }));
  window.addEventListener('scroll', () => selectors.forEach(root => {
    if (root.classList.contains('is-open')) placeViewportMenu(root);
  }), true);
  window.addEventListener('storage', event => {
    if (event.key === 'lpr-language') selectors.forEach(sync);
  });
  window.addEventListener('lpr-language-changed', () => selectors.forEach(sync));
})();
