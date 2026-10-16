// New-tab flyout shared by the main window (in-window fallback) and the
// popup window (src/flyout.html). Uses the page's ipcRenderer and tabManager globals.
// Inline icons for the new-tab flyout (16px, currentColor)
const GD_ICONS = {
  chat: '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-3 2.5V11h0a1 1 0 0 1-1-1z"/>',
  bot: '<rect x="3" y="5" width="10" height="8" rx="2"/><path d="M8 5V2.8M6 9h.01M10 9h.01"/>',
  app: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M6 6.5h.01M10 6.5h.01M5.8 9.8c1.2 1 3.2 1 4.4 0"/>',
  folderPlus: '<path d="M2.5 4.5A1 1 0 0 1 3.5 3.5h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/><path d="M8 7.5v3M6.5 9h3"/>',
  folder: '<path d="M2.5 4.5A1 1 0 0 1 3.5 3.5h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/>',
  terminal: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3"/>',
  pin: '<path d="M6 2.5h4l-.5 4 2 2H4.5l2-2zM8 8.5v5"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'
};
const gdIcon = (name) => `<svg class="gd-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GD_ICONS[name] || ''}</svg>`;
const gdEsc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gdAgo = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  return new Date(t).toLocaleDateString();
};
const gdBase = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

// Windows Terminal style new-tab flyout: New Chat, Bots, Grok Bot app, Build CLI folders.
// Numbered entries (bots, then pinned/recent folders) get Ctrl+Shift+1..9.
const newTabFlyout = {
  el: null,
  anchor: null,

  buildActions(data) {
    const numbered = [];
    const openBuild = (folder) => this.openBuild(folder, data);
    (data.bots || []).forEach(b => numbered.push({ kind: 'bot', bot: b, run: () => tabManager.createTab(b.url) }));
    [...(data.pinned || []), ...(data.recent || [])].forEach(e => numbered.push({ kind: 'folder', entry: e, folder: e.folder, pinned: !!e.pinned, run: () => this.openEntry(e, data) }));
    // Bots 1-10: Ctrl+Shift+1..9,0 / Build folders 1-10: Ctrl+Shift+F1..F10
    numbered.filter(a => a.kind === 'bot').forEach((a, i) => { if (i < 10) a.shortcut = `Ctrl+Shift+${(i + 1) % 10}`; });
    numbered.filter(a => a.kind === 'folder').forEach((a, i) => { if (i < 10) a.shortcut = `Ctrl+Shift+F${i + 1}`; });
    return numbered;
  },

  async openBuild(folder, data) {
    await ipcRenderer.invoke('build-folders-update', { action: 'touch', folder });
    if (data && data.pty) tabManager.createTerminalTab(folder);
    else ipcRenderer.invoke('build-launch-external', folder);
  },

  // Resume a CLI session (or start one in a manually added folder)
  openEntry(e, data) {
    if (!e.sessionId) return this.openBuild(e.folder, data);
    if (data && data.pty) tabManager.createTerminalTab(e.folder, { sessionId: e.sessionId, title: e.title });
    else ipcRenderer.invoke('build-launch-external', e.folder);
  },

  async newBuild() {
    const data = await ipcRenderer.invoke('new-tab-menu-data', { fresh: false });
    if (!data.cli) return;
    const folder = await ipcRenderer.invoke('build-pick-folder');
    if (folder) this.openBuild(folder, data);
  },

  async runIndex(kind, n) {
    const data = await ipcRenderer.invoke('new-tab-menu-data', { fresh: false });
    const a = this.buildActions(data).filter(x => x.kind === kind)[n - 1];
    if (a && !(kind === 'folder' && a.entry.missing)) a.run();
  },

  toggle(anchor) {
    if (this.el) { this.close(); return; }
    this.open(anchor);
  },

  async open(anchor) {
    this.anchor = anchor;
    const el = document.createElement('div');
    el.className = 'gd-flyout';
    this.el = el;
    document.body.appendChild(el);
    this.position();
    // Render immediately from cache, then refresh the bot list from the page
    this.render(await ipcRenderer.invoke('new-tab-menu-data', { fresh: false }));
    ipcRenderer.invoke('new-tab-menu-data', { fresh: true }).then(d => { if (this.el === el) this.render(d); });

    this._out = (e) => { if (this.el && !this.el.contains(e.target) && !anchor.contains(e.target)) this.close(); };
    this._key = (e) => { if (e.key === 'Escape') this.close(); };
    this._blur = () => this.close();
    setTimeout(() => {
      if (!window.GD_POPUP) document.addEventListener('mousedown', this._out, true);
      document.addEventListener('keydown', this._key, true);
      window.addEventListener('blur', this._blur);
    });
  },

  position() {
    if (window.GD_POPUP) {
      // The popup window is sized and clamped to the screen work area by main
      const PAD = 10;
      Object.assign(this.el.style, { left: PAD + 'px', top: PAD + 'px', maxHeight: `calc(100vh - ${2 * PAD}px)` });
      const prev = this.el.style.maxHeight;
      this.el.style.maxHeight = 'none';
      const w = this.el.offsetWidth, h = this.el.offsetHeight;
      this.el.style.maxHeight = prev;
      ipcRenderer.send('flyout-size', w + 2 * PAD, h + 2 * PAD);
      return;
    }
    const r = this.anchor.getBoundingClientRect();
    const top = Math.round(r.bottom + 4);
    this.el.style.top = `${top}px`;
    this.el.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
    // Clamp within the window using the rendered width
    const w = this.el.offsetWidth || 360;
    this.el.style.left = `${Math.round(Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)))}px`;
  },

  close(silent) {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    if (window.GD_POPUP && !silent) ipcRenderer.send('flyout-hide');
    document.removeEventListener('mousedown', this._out, true);
    document.removeEventListener('keydown', this._key, true);
    window.removeEventListener('blur', this._blur);
  },

  render(data) {
    const el = this.el;
    if (!el) return;
    el.innerHTML = '';
    const actions = this.buildActions(data);
    requestAnimationFrame(() => { if (this.el === el) this.position(); });
    const row = ({ icon, iconHtml, label, sub, shortcut, onClick, disabled, extras, title, bold, slots }) => {
      const r = document.createElement('div');
      r.className = 'gd-row' + (disabled ? ' disabled' : '') + (slots === 1 ? ' one-slot' : '');
      if (title) r.title = title;
      r.innerHTML = `<span class="gd-row-icon">${iconHtml || gdIcon(icon)}</span>` +
        `<span class="gd-row-label${bold ? ' bold' : ''}">${gdEsc(label)}${sub ? `<span class="gd-row-sub">${gdEsc(sub)}</span>` : ''}</span>` +
        `<span class="gd-row-shortcut">${gdEsc(shortcut || '')}</span>` +
        `<span class="gd-row-actions"></span>`;
      const act = r.querySelector('.gd-row-actions');
      // Fixed two action slots so shortcuts line up in every row
      (extras || []).concat([{ spacer: true }, { spacer: true }]).slice(0, slots || 2).forEach(x => {
        if (x.spacer) { const sp = document.createElement('span'); sp.className = 'gd-row-btn spacer'; act.appendChild(sp); return; }
        const b = document.createElement('button');
        b.className = 'gd-row-btn' + (x.on ? ' on' : '') + (x.hover ? ' hover' : '');
        b.title = x.title;
        b.innerHTML = gdIcon(x.icon);
        b.addEventListener('click', (e) => { e.stopPropagation(); x.click(); });
        act.appendChild(b);
      });
      if (!disabled) r.addEventListener('click', () => { this.close(); onClick(); });
      el.appendChild(r);
    };
    const sep = () => { const s = document.createElement('div'); s.className = 'gd-sep'; el.appendChild(s); };
    const header = (t) => { const h = document.createElement('div'); h.className = 'gd-header'; h.textContent = t; el.appendChild(h); };

    row({ icon: 'chat', label: 'New Chat', shortcut: 'Ctrl+T', bold: true, onClick: () => tabManager.createTab('https://grok.com') });

    // Bots
    sep();
    header('Bots');
    const bots = actions.filter(a => a.kind === 'bot');
    if (!bots.length) row({ icon: 'bot', label: 'No bots found yet', disabled: true, title: 'Open grok.com in a tab so the sidebar can be read' });
    const setPinned = async (bot, pinned) => {
      // Show the new state at once, then re-sync with what grok.com reports
      bot.pinned = pinned;
      this.render(data);
      const res = await ipcRenderer.invoke('bot-set-pinned', { url: bot.url, pinned });
      if (res && res.error) console.warn('Grok Desktop: bot pin failed:', res.error);
      if (this.el) this.render(await ipcRenderer.invoke('new-tab-menu-data', { fresh: false }));
    };
    bots.forEach(a => row({
      iconHtml: a.bot.avatar ? `<img class="gd-avatar" src="${gdEsc(a.bot.avatar)}" alt="">` : null,
      icon: 'bot', label: a.bot.name, shortcut: a.shortcut, title: a.bot.url, onClick: a.run, slots: 1,
      extras: [a.bot.pinned
        ? { icon: 'pin', on: true, title: 'Unpin (on grok.com)', click: () => setPinned(a.bot, false) }
        : { icon: 'pin', title: 'Pin (on grok.com)', click: () => setPinned(a.bot, true) }]
    }));
    if (data.botApp) row({ icon: 'app', label: 'Open Grok Bot', onClick: () => ipcRenderer.invoke('open-grok-bot') });

    // Build CLI
    sep();
    header(data.cli ? 'Build CLI' : 'Build CLI (grok not found)');
    if (data.cli) {
      const update = async (action, key) => {
        await ipcRenderer.invoke('build-folders-update', { action, key });
        this.render(await ipcRenderer.invoke('new-tab-menu-data', { fresh: false }));
      };
      row({ icon: 'folderPlus', label: 'New…', shortcut: 'Ctrl+Shift+N', onClick: () => this.newBuild() });
      actions.filter(a => a.kind === 'folder').forEach(a => {
        const e = a.entry;
        const name = e.title || gdBase(e.folder);
        const when = e.updated ? gdAgo(e.updated) : '';
        row({
          icon: e.sessionId ? 'terminal' : 'folder',
          label: name + (e.missing ? ' (missing)' : ''),
          sub: (e.title ? gdBase(e.folder) : '') + (when ? (e.title ? ' · ' : '') + when : ''),
          title: (e.title ? e.title + '\n' : '') + e.folder + (e.sessionId ? '\nResume session ' + e.sessionId : '\nNew session'),
          shortcut: a.shortcut, disabled: e.missing, onClick: a.run,
          extras: [
            a.pinned
              ? { icon: 'pin', on: true, title: 'Unpin', click: () => update('unpin', e.key) }
              : { icon: 'pin', title: 'Pin', click: () => update('pin', e.key) },
            { icon: 'trash', hover: true, title: 'Hide from list', click: () => update('remove', e.key) }
          ]
        });
      });
      if (data.hiddenCount) row({ icon: 'folder', label: `Show hidden (${data.hiddenCount})`, title: 'Restore entries hidden from this list', onClick: () => ipcRenderer.invoke('build-folders-update', { action: 'unhide-all', key: 's:' }) });
    }
  }
};
