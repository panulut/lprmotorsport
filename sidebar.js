(() => {
  'use strict';
  const rail = document.querySelector('#left-rail');
  const collapseButton = document.querySelector('#rail-collapse');
  const collapseIcon = collapseButton?.querySelector('use');
  const chatPanel = document.querySelector('#chat-panel');
  const chatHeading = chatPanel?.querySelector('.chat-heading');
  const actionRow = document.querySelector('.sidebar-utility-actions');
  const raceMenu = document.querySelector('#settings-dialog');
  const actionRowHome = actionRow?.parentElement;
  const accountForm = document.querySelector('#leaderboard-start-form');
  const accountSettingsButton = document.querySelector('#leaderboard-settings-open');
  const accountSettingsView = document.querySelector('#leaderboard-settings-view');
  const accountSettingsHeading = accountSettingsView?.querySelector('.leaderboard-settings-heading');
  const accountSettingsBack = document.querySelector('#leaderboard-settings-back');
  const languageAction = document.querySelector('#sidebar-language-selector');
  const driveSettingsPanel = document.querySelector('#drive-settings-panel');
  const driveSettingsToggle = document.querySelector('#drive-settings-toggle');
  const driveSettingsCollapse = document.querySelector('#drive-settings-collapse');
  if (!rail || !collapseButton || !collapseIcon || !chatHeading) return;

  const desktop = window.matchMedia('(min-width: 901px) and (pointer: fine)');
  const t = text => window.LPRI18n?.t(text) ?? text;
  const preferenceKey = 'lpr-sidebar-collapsed';
  let collapsed;
  try {
    const saved = localStorage.getItem(preferenceKey);
    collapsed = saved === null ? !desktop.matches : saved === 'true';
  } catch { collapsed = !desktop.matches; }

  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.classList.add('ph-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    use.setAttribute('href', `assets/phosphor-icons.svg?v=phosphor-regular-2.1.1#${name}`);
    svg.append(use);
    return svg;
  };
  const action = (name, iconName, label) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'sidebar-compact-action';
    control.dataset.action = name;
    control.append(icon(iconName));
    control.setAttribute('aria-label', t(label));
    control.title = t(label);
    control.setAttribute('aria-controls', 'left-rail-content');
    return control;
  };

  const shortcuts = document.createElement('nav');
  shortcuts.className = 'sidebar-compact';
  shortcuts.setAttribute('aria-label', t('Sivupalkin pikavalinnat'));
  shortcuts.hidden = true;
  const chatButton = action('chat', 'chat-circle', 'Avaa varikkochat');
  const accountButton = action('account', 'user', 'Avaa tili');
  const settingsButton = action('settings', 'gear', 'Avaa asetukset');
  const accountSettingsRow = document.createElement('div');
  accountSettingsRow.className = 'sidebar-account-settings-row';
  const settingsViewLanguage = document.createElement('div');
  settingsViewLanguage.className = 'sidebar-settings-language-group';
  if (accountForm && accountSettingsButton && languageAction) {
    accountSettingsButton.before(accountSettingsRow);
    accountSettingsRow.append(accountSettingsButton, languageAction);
  }
  if (accountSettingsHeading && accountSettingsBack && languageAction) {
    accountSettingsBack.after(settingsViewLanguage);
    settingsViewLanguage.append(accountSettingsBack, languageAction);
  }
  const spacer = document.createElement('span');
  spacer.className = 'sidebar-compact-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  const compactActions = [...(actionRow?.children || [])];
  const languageSlot = compactActions.find(control => control.id === 'language-selector-slot');
  const compactUtilities = compactActions.filter(control => control !== languageSlot);
  rail.insertBefore(shortcuts, rail.firstChild);

  function render() {
    const expanded = !collapsed;
    const inRace = !raceMenu?.open;
    const settingsViewOpen = !!accountSettingsView && !accountSettingsView.hidden;
    const label = expanded ? 'Piilota sivupalkki' : 'Näytä sivupalkki';
    rail.classList.toggle('is-collapsed', collapsed);
    document.body.classList.toggle('rail-collapsed', collapsed);
    collapseButton.setAttribute('aria-expanded', String(expanded));
    collapseButton.setAttribute('aria-label', t(label));
    collapseButton.title = t(label);
    collapseIcon.setAttribute('href', `assets/phosphor-icons.svg?v=phosphor-regular-2.1.1#caret-${expanded ? 'left' : 'right'}`);
    rail.setAttribute('aria-label', t('Sivupalkin pikavalinnat'));
    shortcuts.hidden = !collapsed;
    accountForm?.classList.toggle('sidebar-settings-view-open', settingsViewOpen);
    if (collapsed) shortcuts.append(chatButton, collapseButton, spacer, accountButton, settingsButton, ...(!inRace && languageAction ? [languageAction] : []));
    else {
      chatHeading.append(collapseButton);
      if (actionRow) compactActions.forEach(control => actionRow.append(control));
      if (languageAction) {
        if (settingsViewOpen && settingsViewLanguage) settingsViewLanguage.append(languageAction);
        else if (accountSettingsRow) accountSettingsRow.append(languageAction);
      }
    }
    if (actionRow) {
      compactActions.forEach(control => actionRow.append(control));
      if (inRace) {
        (settingsViewOpen ? settingsViewLanguage : accountSettingsRow).append(actionRow);
        if (languageAction) actionRow.append(languageAction);
        actionRow.hidden = false;
        if (collapsed) {
          shortcuts.append(...compactUtilities, ...(languageAction ? [languageAction] : []));
        }
      } else {
        actionRowHome?.append(actionRow);
        actionRow.hidden = true;
      }
    }
  }

  function expand() {
    if (!collapsed) return;
    collapsed = false;
    try { localStorage.setItem(preferenceKey, 'false'); } catch {}
    render();
  }
  function focusAccount() {
    const login = document.querySelector('#leaderboard-login');
    const heading = document.querySelector('#leaderboard-driver-heading');
    const logout = document.querySelector('#leaderboard-logout');
    const guestRegistration = document.querySelector('#guest-register-panel summary');
    if (window.LPRLeaderboard?.accountIdentity && heading && !heading.hidden) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      return;
    }
    if (guestRegistration && !document.querySelector('#guest-register-panel').hidden) {
      guestRegistration.focus({ preventScroll: true });
      return;
    }
    if (login && !window.LPRLeaderboard?.identity) {
      login.click();
      return;
    }
    const target = [logout, heading, document.querySelector('#leaderboard-drive'), login]
      .find(element => element && !element.hidden && element.getClientRects().length);
    target?.focus({ preventScroll: true });
  }

  collapseButton.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem(preferenceKey, String(collapsed)); } catch {}
    render();
    collapseButton.focus({ preventScroll: true });
  });
  chatButton.addEventListener('click', () => {
    expand();
    requestAnimationFrame(() => document.querySelector('#chat-input')?.focus({ preventScroll: true }));
  });
  accountButton.addEventListener('click', () => {
    expand();
    requestAnimationFrame(focusAccount);
  });
  settingsButton.addEventListener('click', () => {
    expand();
    requestAnimationFrame(() => document.querySelector('#leaderboard-settings-open')?.click());
  });
  desktop.addEventListener('change', render);
  window.addEventListener('lpr-language-changed', render);
  window.addEventListener('storage', event => {
    if (event.key !== 'lpr-language') return;
    render();
  });
  if (driveSettingsPanel && driveSettingsToggle && driveSettingsCollapse) {
    const handle = document.createElement('div');
    handle.className = 'drive-settings-handle';
    handle.setAttribute('aria-hidden', 'true');
    driveSettingsPanel.prepend(handle);
    const setDrawerOpen = (open, restoreFocus = false) => {
      driveSettingsPanel.classList.toggle('is-open', open);
      driveSettingsPanel.classList.toggle('is-collapsed', !open);
      driveSettingsPanel.inert = !open;
      driveSettingsPanel.setAttribute('aria-hidden', String(!open));
      driveSettingsToggle.setAttribute('aria-expanded', String(open));
      driveSettingsCollapse.setAttribute('aria-label', t('Sulje'));
      driveSettingsCollapse.title = t('Sulje');
      driveSettingsCollapse.querySelector('use')?.setAttribute('href', 'assets/phosphor-icons.svg?v=phosphor-regular-2.1.1#x');
      if (restoreFocus) driveSettingsToggle.focus({ preventScroll: true });
    };
    driveSettingsToggle.addEventListener('click', () => {
      setDrawerOpen(true);
      driveSettingsCollapse.focus({ preventScroll: true });
    });
    driveSettingsCollapse.addEventListener('click', () => setDrawerOpen(false, true));
    driveSettingsPanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); setDrawerOpen(false, true); }
    });
    let dragStart = null;
    handle.addEventListener('pointerdown', event => {
      dragStart = event.clientY;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointerup', event => {
      if (dragStart !== null && event.clientY - dragStart > 40) setDrawerOpen(false, true);
      dragStart = null;
    });
    handle.addEventListener('pointercancel', () => { dragStart = null; });
    window.addEventListener('lpr-language-changed', () => setDrawerOpen(driveSettingsPanel.classList.contains('is-open')));
    setDrawerOpen(false);
  }
  if (accountSettingsView) new MutationObserver(render).observe(accountSettingsView, { attributes: true, attributeFilter: ['hidden'] });
  if (raceMenu) new MutationObserver(() => {
    // Give the driving view and touch controls their space when leaving the menu.
    if (!raceMenu.open && !desktop.matches) collapsed = true;
    render();
  }).observe(raceMenu, { attributes: true, attributeFilter: ['open'] });
  render();
})();
