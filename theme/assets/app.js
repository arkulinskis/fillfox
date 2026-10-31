/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  /* UI.upload(fn, file, ...args): the server function gets the File as Anvil Media first, then args.
     (Main.py turns the browser File into Media with anvil.js.to_media; locally the harness posts it.) */
  UI.upload = function (fn, file) {
    UI._file = file;
    return send('upload', { fn: fn, args: Array.prototype.slice.call(arguments, 2) }).then(function (res) {
      UI._file = null;
      if (res && typeof res === 'object' && res.ok === false) { var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res; throw err; }
      return res;
    }, function (e) { UI._file = null; throw e; });
  };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'Fillfox',
    key: 'fillfox',          // prefix for this app's browser storage
    tagline: 'Free forms, made in Montréal. No ads, no trackers.',   // footer line
    home: 'forms',               // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (nav.length ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Get started</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _ff.html ===== */
(function () {
  'use strict';
  var FF = window.FF = window.FF || {};
  var esc = UI.esc;

  /* ------------------------------------------------------------------ extra icons */
  var more = {
    form: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    short: '<path d="M4 9h16v6H4z"/><path d="M7 12h5"/>',
    long: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M7 9h10M7 12h10M7 15h6"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    radio: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
    checks: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="m8 12 3 3 5-6"/>',
    select: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="m14 11 2 2 2-2"/>',
    yesno: '<path d="M4 12h7M13 12h7"/><path d="m6 9 2 3-2 3M16 9l3 6M19 9l-3 6"/>',
    scale: '<path d="M4 16h16"/><path d="M6 16v-3M10 16v-5M14 16v-7M18 16V6"/>',
    rank: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 5v2M3.5 11h1.5l-1.5 2h1.5M3.5 17h1.5v2h-1.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    pen: '<path d="M3 20c3-1 5-4 7-4s2 3 4 3 4-3 7-5"/><path d="m14 4 6 6"/>',
    consent: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="m8 12 3 3 5-6"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.4 3M6.6 6.6C4.4 8 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.4-1.2"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    divider: '<path d="M3 12h18"/>',
    page: '<path d="M6 3h8l4 4v14H6z"/><path d="M4 12h16" stroke-dasharray="2 2"/>',
    date: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 12h4a4 4 0 0 0 4-4V8"/><path d="M16 12h-2"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    drag: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    funnel: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-4M14 18v3"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    webhook: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><circle cx="12" cy="6" r="2.5"/><path d="M8.5 17h7M10.8 8.2 7.2 14.8M13.2 8.2l3.6 6.6"/>',
    team: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.5-3 3-4.5 5.5-4.5s5 1.5 5.5 4.5M10.5 19c.5-3 3-4.5 5.5-4.5s5 1.5 5.5 4.5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2-1 3-1h1a3 3 0 0 0 3-3c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
    wand: '<path d="m4 20 11-11M14 4v3M19 9h-3M18 5l-2 2"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    paste: '<rect x="6" y="4" width="12" height="17" rx="1.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    gform: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="9" cy="9" r="1"/><circle cx="9" cy="13" r="1"/><circle cx="9" cy="17" r="1"/><path d="M12 9h4M12 13h4M12 17h4"/>'
  };
  Object.keys(more).forEach(function (k) { UI.ICONS[k] = more[k]; });

  /* ------------------------------------------------------------------ block catalogue */
  // group: what the slash menu shows it under. input: it collects an answer.
  FF.TYPES = {
    short:     { label: 'Short answer',     icon: 'short',    group: 'Questions', input: true, hint: 'Name, title, one line' },
    long:      { label: 'Long answer',      icon: 'long',     group: 'Questions', input: true, hint: 'A paragraph' },
    email:     { label: 'Email',            icon: 'at',       group: 'Questions', input: true },
    number:    { label: 'Number',           icon: 'hash',     group: 'Questions', input: true },
    phone:     { label: 'Phone',            icon: 'phone',    group: 'Questions', input: true },
    url:       { label: 'Website link',     icon: 'link',     group: 'Questions', input: true },
    date:      { label: 'Date',             icon: 'date',     group: 'Questions', input: true },
    time:      { label: 'Time',             icon: 'time',     group: 'Questions', input: true },
    choice:    { label: 'Multiple choice',  icon: 'radio',    group: 'Choices',   input: true, hint: 'Pick one' },
    multi:     { label: 'Checkboxes',       icon: 'checks',   group: 'Choices',   input: true, hint: 'Pick several' },
    dropdown:  { label: 'Dropdown',         icon: 'select',   group: 'Choices',   input: true, hint: 'Long lists, countries' },
    yesno:     { label: 'Yes / No',         icon: 'yesno',    group: 'Choices',   input: true },
    rating:    { label: 'Star rating',      icon: 'star',     group: 'Choices',   input: true },
    scale:     { label: 'Scale / NPS',      icon: 'scale',    group: 'Choices',   input: true, hint: '0 to 10' },
    ranking:   { label: 'Ranking',          icon: 'rank',     group: 'Choices',   input: true, hint: 'Put in order' },
    file:      { label: 'File upload',      icon: 'upload',   group: 'Special',   input: true, hint: 'Up to 10 MB' },
    signature: { label: 'Signature',        icon: 'pen',      group: 'Special',   input: true, hint: 'Draw or type' },
    consent:   { label: 'Consent box',      icon: 'consent',  group: 'Special',   input: true, hint: 'Agree to terms' },
    hidden:    { label: 'Hidden field',     icon: 'eyeoff',   group: 'Special',   input: true, hint: 'Filled from the link' },
    calc:      { label: 'Calculation',      icon: 'calc',     group: 'Special',   input: true, hint: 'Prices, scores' },
    payment:   { label: 'Payment (Stripe)', icon: 'card',     group: 'Special',   input: true, hint: 'Stripe Payment Link' },
    heading:   { label: 'Heading',          icon: 'heading',  group: 'Layout' },
    text:      { label: 'Text',             icon: 'text',     group: 'Layout',    hint: 'Instructions' },
    image:     { label: 'Image',            icon: 'image',    group: 'Layout' },
    divider:   { label: 'Divider',          icon: 'divider',  group: 'Layout' },
    page:      { label: 'New page',         icon: 'page',     group: 'Layout',    hint: 'Split into steps' }
  };
  FF.GROUPS = ['Questions', 'Choices', 'Special', 'Layout'];
  FF.isInput = function (b) { return !!(FF.TYPES[b.type] && FF.TYPES[b.type].input); };
  FF.isAsked = function (b) { return FF.isInput(b) && b.type !== 'hidden' && b.type !== 'calc'; };
  FF.hasOptions = function (b) { return ['choice', 'multi', 'dropdown', 'ranking'].indexOf(b.type) >= 0; };

  FF.uid = function (n) {
    var s = '', abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < (n || 8); i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  };
  FF.keyFor = function (label, taken) {
    var base = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'field';
    if (/^\d/.test(base)) base = 'q_' + base;
    var key = base, n = 2;
    while (taken.indexOf(key) >= 0 || key === 'score') { key = base + '_' + n; n++; }
    return key;
  };

  /* A new block of a type, with sensible defaults. */
  FF.newBlock = function (type, label, blocks) {
    var b = { id: FF.uid(), type: type, label: label || '', help: '', props: {} };
    if (FF.TYPES[type] && FF.TYPES[type].input) {
      b.required = false; b.placeholder = '';
      b.key = FF.keyFor(label || FF.TYPES[type].label, (blocks || []).filter(FF.isInput).map(function (x) { return x.key; }));
    }
    if (FF.hasOptions(b)) b.options = [{ id: FF.uid(6), label: 'Option 1' }, { id: FF.uid(6), label: 'Option 2' }];
    if (type === 'rating') b.props.max = 5;
    if (type === 'scale') b.props = { min: 0, max: 10, low: 'Not likely', high: 'Very likely' };
    if (type === 'file') b.props.max_files = 1;
    if (type === 'calc') b.props = { formula: '', show: true, decimals: 2, prefix: '' };
    if (type === 'heading') b.props.size = 'h2';
    if (type === 'consent' && !label) b.label = 'I agree to the terms.';
    if (type === 'payment') { b.props = { url: '', amount: '', button: '', by: '', links: {}, amounts: {} }; if (!label) b.label = 'Payment'; b.required = true; }
    return b;
  };
  FF.keyed = function (blocks) { var m = {}; blocks.forEach(function (b) { if (FF.isInput(b)) m[b.key] = b; }); return m; };

  /* ------------------------------------------------------------------ logic (same rules as Logic.visible_ids) */
  FF.OPS = { answered: 'is answered', empty: 'is empty', eq: 'is', neq: 'is not', contains: 'contains', gt: 'is more than', lt: 'is less than' };
  FF.isEmpty = function (v) { return v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length); };
  function optLabel(b, id) {
    var o = (b.options || []).filter(function (x) { return x.id === id; })[0];
    if (o) return o.label;
    return typeof id === 'string' && id.indexOf('other:') === 0 ? id.slice(6) : id;
  }
  FF.optLabel = optLabel;
  function num(v) { var x = parseFloat(v); return isNaN(x) ? null : x; }
  function rule(r, b, value) {
    var op = r.op, want = r.v;
    if (op === 'answered') return !FF.isEmpty(value);
    if (op === 'empty') return FF.isEmpty(value);
    if (FF.isEmpty(value)) return op === 'neq';
    if (op === 'gt' || op === 'lt') { var a = num(value), c = num(want); if (a == null || c == null) return false; return op === 'gt' ? a > c : a < c; }
    var hit;
    if (Array.isArray(value)) hit = value.indexOf(want) >= 0 || value.map(function (x) { return String(optLabel(b, x)).toLowerCase(); }).indexOf(String(want).toLowerCase()) >= 0;
    else if (typeof value === 'object') hit = false;
    else {
      var sv = String(value).toLowerCase(), sw = String(want == null ? '' : want).toLowerCase(), lab = String(optLabel(b, value)).toLowerCase();
      hit = op === 'contains' ? (sv.indexOf(sw) >= 0 || lab.indexOf(sw) >= 0) : (sv === sw || lab === sw || (num(value) != null && num(value) === num(want)));
    }
    if (op === 'contains') return hit;
    return op === 'eq' ? hit : !hit;
  }
  FF.passes = function (b, byId, vals) {
    var lg = b.logic;
    if (!lg || !lg.rules || !lg.rules.length) return true;
    var res = lg.rules.map(function (r) { return rule(r, byId[r.q] || {}, vals[r.q]); });
    return lg.match === 'any' ? res.some(Boolean) : res.every(Boolean);
  };
  /* {id: true} for every block the respondent sees. */
  FF.visible = function (blocks, answers) {
    var byId = {}, seen = {}, pageOn = true, vals = {};
    blocks.forEach(function (b) { byId[b.id] = b; });
    blocks.forEach(function (b) {
      if (b.type === 'page') { pageOn = FF.passes(b, byId, vals); if (pageOn) seen[b.id] = true; return; }
      if (pageOn && FF.passes(b, byId, vals)) { seen[b.id] = true; if (FF.isInput(b)) vals[b.id] = answers[b.id]; }
    });
    return seen;
  };
  FF.ruleText = function (b, blocks) {
    var lg = b.logic; if (!lg || !lg.rules || !lg.rules.length) return '';
    var byId = {}; blocks.forEach(function (x) { byId[x.id] = x; });
    return lg.rules.map(function (r) {
      var q = byId[r.q], name = q ? (q.label || q.key) : '(deleted question)';
      var v = r.op === 'answered' || r.op === 'empty' ? '' : ' “' + (q ? optLabel(q, r.v) : r.v) + '”';
      if (q && q.type === 'yesno' && (r.v === 'yes' || r.v === 'no')) v = ' “' + (r.v === 'yes' ? 'Yes' : 'No') + '”';
      return '“' + String(name).slice(0, 40) + '” ' + FF.OPS[r.op] + v;
    }).join(lg.match === 'any' ? ' or ' : ' and ');
  };

  /* ------------------------------------------------------------------ formulas */
  FF.numeric = function (b, v) {
    if (!b || FF.isEmpty(v)) return 0;
    var t = b.type;
    if (t === 'choice' || t === 'dropdown') { var o = (b.options || []).filter(function (x) { return x.id === v; })[0]; return o && o.value ? +o.value : 0; }
    if (t === 'multi') return (b.options || []).reduce(function (s, o) { return s + (v.indexOf(o.id) >= 0 && o.value ? +o.value : 0); }, 0);
    if (t === 'yesno') return v === 'yes' ? 1 : 0;
    if (t === 'consent') return v ? 1 : 0;
    return num(v) || 0;
  };
  FF.formula = function (expr, lookup) {
    var toks = [], re = /\s*(?:(\d+(?:\.\d+)?)|(\{[a-z0-9_]+\})|([a-z]+)|(.))/g, m;
    String(expr || '').replace(/\s+$/, '');
    while ((m = re.exec(expr || '')) && m[0] !== '') {
      if (m[1]) toks.push(['n', parseFloat(m[1])]);
      else if (m[2]) toks.push(['n', +lookup(m[2].slice(1, -1)) || 0]);
      else if (m[3]) toks.push(['f', m[3]]);
      else if (m[4] && m[4].trim()) toks.push(['o', m[4]]);
      if (re.lastIndex >= (expr || '').length) break;
    }
    var pos = 0;
    function peek() { return toks[pos] || [null, null]; }
    function is(k, v) { var t = peek(); return t[0] === k && t[1] === v; }
    function take() { return toks[pos++] || [null, null]; }
    function ex() { var v = term(); while (is('o', '+') || is('o', '-')) { var op = take()[1], r = term(); v = op === '+' ? v + r : v - r; } return v; }
    function term() { var v = un(); while (is('o', '*') || is('o', '/') || is('o', '%')) { var op = take()[1], r = un(); v = op === '*' ? v * r : op === '/' ? (r ? v / r : 0) : (r ? v % r : 0); } return v; }
    function un() { if (is('o', '-')) { take(); return -un(); } if (is('o', '+')) { take(); return un(); } return atom(); }
    function atom() {
      var t = take();
      if (t[0] === 'n') return t[1];
      if (t[0] === 'o' && t[1] === '(') { var v = ex(); if (is('o', ')')) take(); return v; }
      if (t[0] === 'f' && ['round', 'min', 'max', 'abs'].indexOf(t[1]) >= 0 && is('o', '(')) {
        take(); var args = [ex()];
        while (is('o', ',')) { take(); args.push(ex()); }
        if (is('o', ')')) take();
        if (t[1] === 'round') { var p = Math.pow(10, args[1] || 0); return Math.round(args[0] * p) / p; }
        if (t[1] === 'abs') return Math.abs(args[0]);
        return t[1] === 'min' ? Math.min.apply(null, args) : Math.max.apply(null, args);
      }
      throw new Error('bad formula');
    }
    try { var v = ex(); return pos < toks.length || !isFinite(v) ? 0 : v; } catch (e) { return 0; }
  };
  FF.formulaError = function (expr, blocks) {
    var keys = FF.keyed(blocks), bad = [];
    String(expr || '').replace(/\{([a-z0-9_]+)\}/g, function (_, k) { if (!keys[k] && k !== 'score') bad.push(k); });
    if (bad.length) return 'Unknown field: {' + bad[0] + '}';
    var ok = true;
    try { FF.formula(expr, function () { return 1; }); } catch (e) { ok = false; }
    return ok ? '' : 'This formula has a typo.';
  };
  FF.calc = function (blocks, answers, score) {
    var keys = FF.keyed(blocks), vals = Object.assign({}, answers), out = {};
    blocks.forEach(function (b) {
      if (b.type !== 'calc') return;
      var v = FF.formula(b.props.formula, function (k) { return k === 'score' ? (score || 0) : keys[k] ? FF.numeric(keys[k], vals[keys[k].id]) : 0; });
      var p = Math.pow(10, b.props.decimals == null ? 2 : b.props.decimals);
      vals[b.id] = out[b.id] = Math.round(v * p) / p;
    });
    return out;
  };
  FF.score = function (blocks, answers, vis) {
    var got = 0, best = 0;
    blocks.forEach(function (b) {
      if (!FF.isInput(b) || (vis && !vis[b.id])) return;
      var pts = b.points == null ? 1 : b.points, v = answers[b.id];
      if ((b.type === 'choice' || b.type === 'dropdown') && b.correct && b.correct.length) { best += pts; if (b.correct.indexOf(v) >= 0) got += pts; }
      else if (b.type === 'multi' && b.correct && b.correct.length) { best += pts; if (Array.isArray(v) && v.slice().sort().join() === b.correct.slice().sort().join()) got += pts; }
      else if (b.type === 'short' && b.props.accept && b.props.accept.length) {
        best += pts;
        var norm = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
        if (b.props.accept.map(norm).indexOf(norm(v)) >= 0) got += pts;
      }
    });
    return { got: got, max: best };
  };

  /* ------------------------------------------------------------------ answers as text, piping */
  FF.display = function (b, v) {
    if (!b || FF.isEmpty(v)) return '';
    var t = b.type;
    if (t === 'choice' || t === 'dropdown') return String(optLabel(b, v));
    if (t === 'multi' || t === 'ranking') return v.map(function (x) { return optLabel(b, x); }).join(', ');
    if (t === 'yesno') return v === 'yes' ? 'Yes' : 'No';
    if (t === 'signature') return v.kind === 'type' ? 'Signed: ' + v.name : 'Signed (drawing)';
    if (t === 'file') return v.map(function (x) { return x.name || 'file'; }).join(', ');
    if (t === 'consent') return 'Yes';
    if (t === 'rating') return v + ' / ' + (b.props.max || 5);
    if (t === 'calc') return (b.props.prefix || '') + FF.fmtNum(v, b.props.decimals);
    if (t === 'payment') return v.confirmed ? 'Paid (confirmed by the person)' : '';
    return String(v);
  };
  /* Payments: Stripe-hosted links only. One link, or one per option of an earlier choice question. */
  FF.STRIPE = /^https:\/\/(buy|donate|checkout)\.stripe\.com\/[A-Za-z0-9_\-\/]+$/;
  FF.paymentLink = function (b, answers) {
    var p = b.props || {};
    if (p.by) return { url: (p.links || {})[answers[p.by]] || '', amount: (p.amounts || {})[answers[p.by]] || p.amount || '', needs: !answers[p.by] };
    return { url: p.url || '', amount: p.amount || '', needs: false };
  };
  FF.fmtNum = function (v, decimals) {
    var n = +v || 0;
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals == null ? 2 : decimals, minimumFractionDigits: 0 });
  };
  /* {key} -> the answer, {score} -> quiz score. Returns plain text (escape it before inserting). */
  FF.pipe = function (text, blocks, answers, extra) {
    var keys = FF.keyed(blocks || []);
    return String(text || '').replace(/\{([a-z0-9_]+)\}/g, function (all, k) {
      if (extra && k in extra) return extra[k];
      var b = keys[k];
      if (!b) return all;
      var s = FF.display(b, answers[b.id]);
      return s || '___';
    });
  };
  /* Escaped text with line breaks and https links. */
  FF.richText = function (s) {
    return esc(s).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
  };

  /* ------------------------------------------------------------------ colours */
  function rgb(hex) { var h = String(hex || '#000000').replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) || 0; }); }
  function lum(hex) {
    return rgb(hex).map(function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
      .reduce(function (s, c, i) { return s + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  FF.contrast = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  FF.inkOn = function (hex) { return FF.contrast(hex, '#ffffff') >= FF.contrast(hex, '#0a0a0a') ? '#ffffff' : '#0a0a0a'; };
  FF.ACCENTS = ['#0a0a0a', '#ff4f1f', '#1f5eff', '#11804a', '#7a3cff', '#d61f69', '#b07800', '#0f7c8c'];
  FF.FONTS = { plex: ['IBM Plex Sans', '"IBM Plex Sans", system-ui, sans-serif'], grotesk: ['Space Grotesk', '"Space Grotesk", system-ui, sans-serif'],
               serif: ['Fraunces', '"Fraunces", Georgia, serif'], mono: ['IBM Plex Mono', '"IBM Plex Mono", ui-monospace, monospace'] };
  FF.LANGS = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', pt: 'Português', lv: 'Latviešu' };

  /* ------------------------------------------------------------------ built-in option lists */
  FF.LISTS = {
    countries: { label: 'Countries', items: 'Afghanistan|Albania|Algeria|Andorra|Angola|Antigua and Barbuda|Argentina|Armenia|Australia|Austria|Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belgium|Belize|Benin|Bhutan|Bolivia|Bosnia and Herzegovina|Botswana|Brazil|Brunei|Bulgaria|Burkina Faso|Burundi|Cabo Verde|Cambodia|Cameroon|Canada|Central African Republic|Chad|Chile|China|Colombia|Comoros|Congo|Costa Rica|Côte d’Ivoire|Croatia|Cuba|Cyprus|Czechia|Democratic Republic of the Congo|Denmark|Djibouti|Dominica|Dominican Republic|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|Eswatini|Ethiopia|Fiji|Finland|France|Gabon|Gambia|Georgia|Germany|Ghana|Greece|Grenada|Guatemala|Guinea|Guinea-Bissau|Guyana|Haiti|Honduras|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|Israel|Italy|Jamaica|Japan|Jordan|Kazakhstan|Kenya|Kiribati|Kuwait|Kyrgyzstan|Laos|Latvia|Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Madagascar|Malawi|Malaysia|Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Mexico|Micronesia|Moldova|Monaco|Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Netherlands|New Zealand|Nicaragua|Niger|Nigeria|North Korea|North Macedonia|Norway|Oman|Pakistan|Palau|Palestine|Panama|Papua New Guinea|Paraguay|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|San Marino|São Tomé and Príncipe|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Singapore|Slovakia|Slovenia|Solomon Islands|Somalia|South Africa|South Korea|South Sudan|Spain|Sri Lanka|Sudan|Suriname|Sweden|Switzerland|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Timor-Leste|Togo|Tonga|Trinidad and Tobago|Tunisia|Türkiye|Turkmenistan|Tuvalu|Uganda|Ukraine|United Arab Emirates|United Kingdom|United States|Uruguay|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|Zambia|Zimbabwe' },
    provinces: { label: 'Canadian provinces & territories', items: 'Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Northwest Territories|Nova Scotia|Nunavut|Ontario|Prince Edward Island|Québec|Saskatchewan|Yukon' },
    states: { label: 'US states', items: 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming' },
    languages: { label: 'Languages', items: 'Arabic|Bengali|Cantonese|Dutch|English|Farsi|French|German|Greek|Gujarati|Hebrew|Hindi|Indonesian|Italian|Japanese|Korean|Latvian|Malay|Mandarin|Polish|Portuguese|Punjabi|Romanian|Russian|Spanish|Swahili|Swedish|Tagalog|Tamil|Thai|Turkish|Ukrainian|Urdu|Vietnamese|Other' },
    currencies: { label: 'Currencies', items: 'CAD - Canadian dollar|USD - US dollar|EUR - Euro|GBP - British pound|JPY - Japanese yen|CNY - Chinese yuan|INR - Indian rupee|AUD - Australian dollar|CHF - Swiss franc|MXN - Mexican peso|BRL - Brazilian real|SEK - Swedish krona|NOK - Norwegian krone|DKK - Danish krone|PLN - Polish zloty|KRW - South Korean won|SGD - Singapore dollar|NZD - New Zealand dollar|ZAR - South African rand' },
    weekdays: { label: 'Days of the week', items: 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday' },
    months: { label: 'Months', items: 'January|February|March|April|May|June|July|August|September|October|November|December' },
    agree: { label: 'Agree / disagree (5 points)', items: 'Strongly disagree|Disagree|Neutral|Agree|Strongly agree' }
  };
  FF.listOptions = function (name) { return FF.LISTS[name].items.split('|').map(function (s) { return { id: FF.uid(6), label: s }; }); };

  /* ------------------------------------------------------------------ "write it like a document": guess a question's type */
  FF.guess = function (line, blocks) {
    var raw = String(line || '').trim(), low = raw.toLowerCase();
    var mk = function (t, label) { return FF.newBlock(t, label, blocks); };
    if (!raw) return null;
    if (/^#{1,3}\s+/.test(raw)) { var h = mk('heading', raw.replace(/^#+\s+/, '')); if (/^###/.test(raw)) h.props.size = 'h3'; return h; }
    if (/^(---+|___+)$/.test(raw)) return mk('page', '');
    // "Question? (A / B / C)" or "Question: A, B, or C" -> choices
    var m = raw.match(/^(.*?[?:])\s*\(?([^()]+\/[^()]+)\)?\s*$/) || raw.match(/^(.*?\?)\s+([^?]+,[^?]+)$/);
    if (m && m[2]) {
      var parts = m[2].split(/\s*(?:\/|,|\bor\b)\s*/).map(function (s) { return s.trim().replace(/^and\s+/, ''); }).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 30) {
        var multi = /\b(select all|all that apply|check all|which ones|several)\b/i.test(m[1]);
        var b = mk(multi ? 'multi' : parts.length > 7 ? 'dropdown' : 'choice', m[1].replace(/:$/, '').trim());
        b.options = parts.map(function (p) { return { id: FF.uid(6), label: p }; });
        return b;
      }
    }
    var req = /\*\s*$/.test(raw); var label = raw.replace(/\s*\*\s*$/, '');
    var t = 'short';
    if (/\be-?mail\b/.test(low)) t = 'email';
    else if (/\b(phone|mobile|cell)\b/.test(low)) t = 'phone';
    else if (/\b(website|url|link|portfolio|linkedin)\b/.test(low)) t = 'url';
    else if (/\b(date|birthday|when (did|will|do)|deadline|start date|day of)\b/.test(low)) t = 'date';
    else if (/\b(what time|time of)\b/.test(low)) t = 'time';
    else if (/\b(how likely|recommend)\b/.test(low)) t = 'scale';
    else if (/\b(rate|rating|how (good|satisfied|happy)|stars?)\b/.test(low)) t = 'rating';
    else if (/\b(how many|number of|how much|age|budget|quantity|amount|price)\b/.test(low)) t = 'number';
    else if (/^(do|did|are|is|have|has|will|would|can|could|should)\b.*\?$/.test(low) && low.length < 90) t = 'yesno';
    else if (/\b(upload|attach|cv|resume|résumé|screenshot)\b/.test(low)) t = 'file';
    else if (/\b(sign here|signature)\b/.test(low)) t = 'signature';
    else if (/\b(i agree|i accept|i consent)\b/.test(low)) t = 'consent';
    else if (/\b(describe|tell us|explain|anything else|comments?|feedback|why|message|details|notes?)\b/.test(low) || label.length > 90) t = 'long';
    else if (!/[?:]$/.test(raw) && raw.split(' ').length > 9) return mk('text', raw);
    var out = mk(t, label);
    out.required = req;
    return out;
  };
  /* Many lines -> blocks. "- option" lines under a question become its options. */
  FF.parseQuestions = function (text) {
    var blocks = [], last = null;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var opt = line.match(/^\s*(?:[-*•]|\[ ?\]|\(\s?\)|[a-zA-Z0-9][.)])\s+(.+)$/);
      if (opt && last && FF.isInput(last)) {
        if (!FF.hasOptions(last)) {
          var isMulti = /\[ ?\]/.test(line) || /\b(all that apply|select all|check all)\b/i.test(last.label);
          var nb = FF.newBlock(isMulti ? 'multi' : 'choice', last.label, blocks.slice(0, -1));
          nb.required = last.required; nb.options = [];
          blocks[blocks.length - 1] = last = nb;
        }
        if (last.options.length === 2 && /^Option \d$/.test(last.options[0].label)) last.options = [];
        last.options.push({ id: FF.uid(6), label: opt[1].trim() });
        if (last.options.length > 8 && last.type === 'choice') last.type = 'dropdown';
        return;
      }
      var b = FF.guess(line.replace(/^\s*\d+[.)]\s+/, ''), blocks);
      if (b) { blocks.push(b); last = b; }
    });
    return blocks;
  };

  /* ------------------------------------------------------------------ the form checker */
  var SENSITIVE = [
    [/\bpass ?words?\b|\bpasscodes?\b|\bpwd\b/i, 'passwords'],
    [/\bpin (code|number)\b|\byour pin\b/i, 'PIN codes'],
    [/\b(credit|debit) ?card (number|no)\b|\bcard number\b|\bcvv\b|\bcvc\b|\bsecurity code\b/i, 'payment card numbers'],
    [/\bone[- ]time (code|password)\b|\b2fa code\b|\bverification code\b|\botp\b/i, 'one-time codes'],
    [/\bsocial security\b|\bssn\b|\bsocial insurance number\b|\bsin number\b/i, 'social security / insurance numbers'],
    [/\bseed phrase\b|\brecovery phrase\b|\bprivate key\b|\bwallet phrase\b/i, 'wallet recovery phrases'],
    [/\b(verify|confirm|validate) your (account|mailbox|email account|identity)\b|\bmailbox (upgrade|quota)\b|\baccount (suspended|deactivat)/i, 'account-verification wording'],
    [/\b(log ?in|sign ?in) (to|with) (your )?(microsoft|office ?365|outlook|google|gmail|apple|icloud|paypal|amazon|netflix|bank|desjardins|rbc|td|bmo|scotiabank|cra|irs)\b/i, 'sign-in wording for another company']
  ];
  /* [{level: 'block'|'warn'|'tip', text, id}] */
  FF.doctor = function (form) {
    var out = [], blocks = form.blocks || [], s = form.settings || {};
    var add = function (level, text, id) { out.push({ level: level, text: text, id: id || null }); };
    var all = [['title', form.title || ''], ['description', s.description || '']];
    blocks.forEach(function (b) {
      all.push([b.id, [b.label, b.help, b.placeholder].concat((b.options || []).map(function (o) { return o.label; })).join(' ')]);
    });
    var flagged = {};
    all.forEach(function (x) {
      SENSITIVE.forEach(function (p) {
        if (p[0].test(x[1]) && !flagged[p[1]]) { flagged[p[1]] = 1; add('block', 'Asks for ' + p[1] + '. Fillfox won\'t publish forms that collect these: it\'s how phishing works.', x[0] === 'title' || x[0] === 'description' ? null : x[0]); }
      });
    });
    var inputs = blocks.filter(FF.isAsked);
    if (!inputs.length) add('warn', 'No questions yet. Type one, or press / to pick a block.');
    blocks.forEach(function (b, i) {
      if (FF.isInput(b) && b.type !== 'calc' && !String(b.label || '').trim()) add('warn', 'A ' + FF.TYPES[b.type].label.toLowerCase() + ' has no question text. Screen readers need it.', b.id);
      if (b.type === 'image' && b.props.url && !b.props.alt) add('warn', 'An image has no description (alt text) for people who can\'t see it.', b.id);
      if (b.type === 'image' && !b.props.url) add('warn', 'An image block has no picture yet.', b.id);
      if (FF.hasOptions(b) && (b.options || []).length < 2) add('warn', '“' + (b.label || 'A choice') + '” needs at least two options.', b.id);
      if (b.type === 'calc') { var e = FF.formulaError(b.props.formula, blocks); if (!b.props.formula) add('warn', 'A calculation has no formula yet.', b.id); else if (e) add('warn', e + ' in “' + (b.label || 'calculation') + '”.', b.id); }
      if (b.type === 'payment') {
        var pp = b.props || {};
        if (!pp.by && !FF.STRIPE.test(pp.url || '')) add('warn', 'The payment needs a Stripe Payment Link (https://buy.stripe.com/…).', b.id);
        if (pp.by) { var src = blocks.filter(function (x) { return x.id === pp.by; })[0]; var missing = src ? (src.options || []).filter(function (o) { return !FF.STRIPE.test((pp.links || {})[o.id] || ''); }).length : 1;
          if (missing) add('warn', UI.plural(missing, 'option') + ' of “' + (src ? src.label : 'the question') + '” ' + (missing === 1 ? 'has' : 'have') + ' no Stripe link: people who pick ' + (missing === 1 ? 'it' : 'them') + ' can\'t pay.', b.id); }
      }
      if (b.logic && b.logic.rules) b.logic.rules.forEach(function (r) {
        var j = -1; blocks.forEach(function (x, k) { if (x.id === r.q) j = k; });
        if (j < 0) add('warn', 'A rule points at a question that was deleted.', b.id);
        else if (j > i) add('warn', '“' + (b.label || 'A block') + '” depends on a later question, so it will stay hidden until then.', b.id);
      });
      if (FF.isInput(b) && b.placeholder && !b.label) add('tip', 'Placeholders disappear as people type. Put the question in the question text.', b.id);
    });
    if (s.quiz) {
      var graded = blocks.filter(function (b) { return (b.correct && b.correct.length) || (b.props && b.props.accept && b.props.accept.length); });
      if (!graded.length) add('warn', 'Quiz mode is on, but no question has a correct answer yet.');
    }
    var req = inputs.filter(function (b) { return b.required; }).length;
    if (inputs.length >= 6 && req === inputs.length) add('tip', 'Every question is required. Making a few optional usually means more people finish.');
    if (s.accent && FF.contrast(s.accent, '#ffffff') < 3) add('tip', 'Your accent colour is pale: buttons get dark text so they stay readable.');
    var keys = {}; blocks.filter(FF.isInput).forEach(function (b) { if (keys[b.key]) add('warn', 'Two fields share the name {' + b.key + '}.', b.id); keys[b.key] = 1; });
    if (inputs.length > 25 && s.layout !== 'focus') add('tip', 'A long form: page breaks (type --- or pick “New page”) make it feel shorter.');
    return out;
  };
  /* Rough time to fill, in minutes. */
  FF.minutes = function (blocks) {
    var secs = blocks.reduce(function (s, b) {
      return s + ({ long: 40, file: 30, signature: 20, ranking: 20, text: 6, heading: 0, divider: 0, page: 2, image: 3, hidden: 0, calc: 0 }[b.type] || 9);
    }, 0);
    return Math.max(1, Math.round(secs / 60));
  };

  /* ------------------------------------------------------------------ misc */
  FF.formUrl = function (slug, params) {
    var base = location.origin + location.pathname.replace(/index\.html$/, '');
    if (location.search && /[?&]as=/.test(location.search)) base = location.origin + '/';
    return base + '#f/' + slug + (params ? '?' + params : '');
  };
  FF.copy = function (text, msg) {
    var done = function () { UI.toast(msg || 'Copied', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this:', text); });
    else { prompt('Copy this:', text); }
  };
  FF.download = function (name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  FF.statusBadge = function (st, open) {
    if (st === 'live' && open === false) return '<span class="ui-badge warn">Closed</span>';
    return { draft: '<span class="ui-badge">Draft</span>', live: '<span class="ui-badge good">● Live</span>', closed: '<span class="ui-badge warn">Closed</span>', suspended: '<span class="ui-badge bad">Paused</span>' }[st] || '';
  };
  FF.spark = function (counts) {
    var max = Math.max.apply(null, counts.concat([1])), w = 112, h = 28, step = w / Math.max(counts.length - 1, 1);
    var pts = counts.map(function (c, i) { return (i * step).toFixed(1) + ',' + (h - 2 - (c / max) * (h - 4)).toFixed(1); }).join(' ');
    return '<svg class="ff-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  };
})();

/* ===== _ffr.html ===== */
(function () {
  'use strict';
  var FF = window.FF, esc = UI.esc;

  var T = {
    en: { pay: 'Pay', paid: "I've completed the payment", payChoose: 'Choose an option above first.', payNote: "Opens Stripe's secure checkout in a new tab. Come back here when you've paid.", next: 'Next', back: 'Back', submit: 'Submit', required: 'required', enter: 'press Enter ↵', other: 'Other', otherPh: 'Type your answer', choose: 'Choose…',
      draw: 'Draw', type: 'Type', clear: 'Clear', signName: 'Type your full name', signDraw: 'Sign with your finger or mouse', upload: 'Choose a file or drop it here', uploading: 'Uploading…', remove: 'Remove',
      yes: 'Yes', no: 'No', kept: 'We kept your answers from last time on this device.', startOver: 'Start over', noPw: 'Never submit passwords through Fillfox.', report: 'Report this form',
      made: 'Made with Fillfox', fix: 'Please check these answers', score: 'Your score', already: 'You already answered this form on this device.', thanks: 'Thank you!', sending: 'Sending…',
      keep: 'This order is fine', up: 'Move up', down: 'Move down', min: 'min', redirect: 'Taking you onward…', privacy: 'Privacy contact', of: 'of',
      e: { payment: 'Please complete the payment, then tick the box.', payment_choice: 'Please choose an option above first.', required: 'This one is required.', email: 'That doesn\'t look like an email address.', phone: 'That doesn\'t look like a phone number.', url: 'That doesn\'t look like a web address.',
        number: 'Please type a number.', range: 'That number is out of range.', date: 'Please pick a date.', time: 'Please pick a time.', option: 'Please pick one of the options.',
        count: 'Please pick the right number of options.', ranking: 'Please put these in order.', signature: 'Please sign.', file: 'Please wait for the upload to finish.' } },
    fr: { pay: 'Payer', paid: 'J’ai effectué le paiement', payChoose: 'Choisissez d’abord une option plus haut.', payNote: 'Ouvre le paiement sécurisé de Stripe dans un nouvel onglet. Revenez ici une fois payé.', next: 'Suivant', back: 'Retour', submit: 'Envoyer', required: 'obligatoire', enter: 'touche Entrée ↵', other: 'Autre', otherPh: 'Votre réponse', choose: 'Choisir…',
      draw: 'Dessiner', type: 'Écrire', clear: 'Effacer', signName: 'Votre nom complet', signDraw: 'Signez avec le doigt ou la souris', upload: 'Choisir un fichier ou le déposer ici', uploading: 'Envoi…', remove: 'Retirer',
      yes: 'Oui', no: 'Non', kept: 'Nous avons gardé vos réponses sur cet appareil.', startOver: 'Recommencer', noPw: 'N’envoyez jamais de mot de passe avec Fillfox.', report: 'Signaler ce formulaire',
      made: 'Fait avec Fillfox', fix: 'Vérifiez ces réponses', score: 'Votre score', already: 'Vous avez déjà répondu sur cet appareil.', thanks: 'Merci !', sending: 'Envoi…',
      keep: 'Cet ordre me va', up: 'Monter', down: 'Descendre', min: 'min', redirect: 'Redirection…', privacy: 'Responsable de la vie privée', of: 'sur',
      e: { payment: 'Effectuez le paiement, puis cochez la case.', payment_choice: 'Choisissez d’abord une option plus haut.', required: 'Cette réponse est obligatoire.', email: 'Ce n’est pas une adresse courriel valide.', phone: 'Ce n’est pas un numéro de téléphone valide.', url: 'Ce n’est pas une adresse web valide.',
        number: 'Entrez un nombre.', range: 'Ce nombre est hors limites.', date: 'Choisissez une date.', time: 'Choisissez une heure.', option: 'Choisissez une option.',
        count: 'Choisissez le bon nombre d’options.', ranking: 'Classez ces éléments.', signature: 'Veuillez signer.', file: 'Attendez la fin de l’envoi.' } },
    es: { pay: 'Pagar', paid: 'Ya hice el pago', payChoose: 'Elige primero una opción de arriba.', payNote: 'Abre el pago seguro de Stripe en una pestaña nueva. Vuelve aquí cuando hayas pagado.', next: 'Siguiente', back: 'Atrás', submit: 'Enviar', required: 'obligatorio', enter: 'pulsa Intro ↵', other: 'Otro', otherPh: 'Tu respuesta', choose: 'Elegir…',
      draw: 'Dibujar', type: 'Escribir', clear: 'Borrar', signName: 'Escribe tu nombre completo', signDraw: 'Firma con el dedo o el ratón', upload: 'Elige un archivo o suéltalo aquí', uploading: 'Subiendo…', remove: 'Quitar',
      yes: 'Sí', no: 'No', kept: 'Guardamos tus respuestas en este dispositivo.', startOver: 'Empezar de nuevo', noPw: 'Nunca envíes contraseñas con Fillfox.', report: 'Denunciar este formulario',
      made: 'Hecho con Fillfox', fix: 'Revisa estas respuestas', score: 'Tu puntuación', already: 'Ya respondiste en este dispositivo.', thanks: '¡Gracias!', sending: 'Enviando…',
      keep: 'Este orden está bien', up: 'Subir', down: 'Bajar', min: 'min', redirect: 'Redirigiendo…', privacy: 'Contacto de privacidad', of: 'de',
      e: { payment: 'Completa el pago y marca la casilla.', payment_choice: 'Elige primero una opción de arriba.', required: 'Esta respuesta es obligatoria.', email: 'No parece un correo válido.', phone: 'No parece un teléfono válido.', url: 'No parece una dirección web.', number: 'Escribe un número.',
        range: 'Ese número está fuera de rango.', date: 'Elige una fecha.', time: 'Elige una hora.', option: 'Elige una opción.', count: 'Elige el número correcto de opciones.',
        ranking: 'Ordena estos elementos.', signature: 'Por favor, firma.', file: 'Espera a que termine la subida.' } },
    de: { pay: 'Bezahlen', paid: 'Ich habe bezahlt', payChoose: 'Bitte zuerst oben eine Option wählen.', payNote: 'Öffnet die sichere Stripe-Kasse in einem neuen Tab. Kommen Sie nach dem Bezahlen hierher zurück.', next: 'Weiter', back: 'Zurück', submit: 'Absenden', required: 'Pflicht', enter: 'Enter drücken ↵', other: 'Andere', otherPh: 'Ihre Antwort', choose: 'Auswählen…',
      draw: 'Zeichnen', type: 'Tippen', clear: 'Löschen', signName: 'Vollständiger Name', signDraw: 'Mit Finger oder Maus unterschreiben', upload: 'Datei wählen oder hier ablegen', uploading: 'Lädt hoch…', remove: 'Entfernen',
      yes: 'Ja', no: 'Nein', kept: 'Ihre Antworten wurden auf diesem Gerät gespeichert.', startOver: 'Neu beginnen', noPw: 'Senden Sie niemals Passwörter über Fillfox.', report: 'Formular melden',
      made: 'Erstellt mit Fillfox', fix: 'Bitte prüfen Sie diese Antworten', score: 'Ihre Punktzahl', already: 'Sie haben auf diesem Gerät schon geantwortet.', thanks: 'Danke!', sending: 'Senden…',
      keep: 'Diese Reihenfolge passt', up: 'Nach oben', down: 'Nach unten', min: 'Min.', redirect: 'Weiterleitung…', privacy: 'Datenschutzkontakt', of: 'von',
      e: { payment: 'Bitte bezahlen und dann das Kästchen ankreuzen.', payment_choice: 'Bitte zuerst oben eine Option wählen.', required: 'Diese Angabe ist Pflicht.', email: 'Das ist keine gültige E-Mail-Adresse.', phone: 'Das ist keine gültige Telefonnummer.', url: 'Das ist keine gültige Webadresse.',
        number: 'Bitte eine Zahl eingeben.', range: 'Die Zahl liegt außerhalb des Bereichs.', date: 'Bitte ein Datum wählen.', time: 'Bitte eine Uhrzeit wählen.', option: 'Bitte eine Option wählen.',
        count: 'Bitte die richtige Anzahl wählen.', ranking: 'Bitte in eine Reihenfolge bringen.', signature: 'Bitte unterschreiben.', file: 'Bitte warten, bis der Upload fertig ist.' } },
    pt: { pay: 'Pagar', paid: 'Já fiz o pagamento', payChoose: 'Escolha primeiro uma opção acima.', payNote: 'Abre o pagamento seguro da Stripe num novo separador. Volte aqui depois de pagar.', next: 'Seguinte', back: 'Voltar', submit: 'Enviar', required: 'obrigatório', enter: 'prima Enter ↵', other: 'Outro', otherPh: 'A sua resposta', choose: 'Escolher…',
      draw: 'Desenhar', type: 'Escrever', clear: 'Limpar', signName: 'Escreva o nome completo', signDraw: 'Assine com o dedo ou o rato', upload: 'Escolha um ficheiro ou largue-o aqui', uploading: 'A enviar…', remove: 'Remover',
      yes: 'Sim', no: 'Não', kept: 'Guardámos as suas respostas neste dispositivo.', startOver: 'Recomeçar', noPw: 'Nunca envie palavras-passe pelo Fillfox.', report: 'Denunciar este formulário',
      made: 'Feito com Fillfox', fix: 'Verifique estas respostas', score: 'A sua pontuação', already: 'Já respondeu neste dispositivo.', thanks: 'Obrigado!', sending: 'A enviar…',
      keep: 'Esta ordem está boa', up: 'Subir', down: 'Descer', min: 'min', redirect: 'A redirecionar…', privacy: 'Contacto de privacidade', of: 'de',
      e: { payment: 'Faça o pagamento e marque a caixa.', payment_choice: 'Escolha primeiro uma opção acima.', required: 'Esta resposta é obrigatória.', email: 'Não parece um email válido.', phone: 'Não parece um telefone válido.', url: 'Não parece um endereço web.', number: 'Escreva um número.',
        range: 'Esse número está fora dos limites.', date: 'Escolha uma data.', time: 'Escolha uma hora.', option: 'Escolha uma opção.', count: 'Escolha o número certo de opções.',
        ranking: 'Ordene estes itens.', signature: 'Por favor, assine.', file: 'Aguarde o fim do envio.' } },
    lv: { pay: 'Maksāt', paid: 'Esmu samaksājis', payChoose: 'Vispirms izvēlies variantu augstāk.', payNote: 'Atver Stripe drošo maksājumu jaunā cilnē. Atgriezies šeit pēc samaksas.', next: 'Tālāk', back: 'Atpakaļ', submit: 'Nosūtīt', required: 'obligāts', enter: 'nospied Enter ↵', other: 'Cits', otherPh: 'Tava atbilde', choose: 'Izvēlies…',
      draw: 'Zīmēt', type: 'Rakstīt', clear: 'Notīrīt', signName: 'Raksti pilnu vārdu', signDraw: 'Paraksties ar pirkstu vai peli', upload: 'Izvēlies failu vai ievelc to šeit', uploading: 'Augšupielādē…', remove: 'Noņemt',
      yes: 'Jā', no: 'Nē', kept: 'Tavas atbildes saglabātas šajā ierīcē.', startOver: 'Sākt no jauna', noPw: 'Nekad nesūti paroles caur Fillfox.', report: 'Ziņot par šo formu',
      made: 'Veidots ar Fillfox', fix: 'Lūdzu, pārbaudi šīs atbildes', score: 'Tavs rezultāts', already: 'Tu jau atbildēji šajā ierīcē.', thanks: 'Paldies!', sending: 'Sūta…',
      keep: 'Šī secība ir laba', up: 'Uz augšu', down: 'Uz leju', min: 'min', redirect: 'Pārvirza…', privacy: 'Privātuma kontakts', of: 'no',
      e: { payment: 'Lūdzu, samaksā un atzīmē lodziņu.', payment_choice: 'Vispirms izvēlies variantu augstāk.', required: 'Šī atbilde ir obligāta.', email: 'Tā neizskatās pēc e-pasta adreses.', phone: 'Tas neizskatās pēc tālruņa numura.', url: 'Tā neizskatās pēc tīmekļa adreses.',
        number: 'Lūdzu, ievadi skaitli.', range: 'Skaitlis ir ārpus robežām.', date: 'Lūdzu, izvēlies datumu.', time: 'Lūdzu, izvēlies laiku.', option: 'Lūdzu, izvēlies variantu.',
        count: 'Lūdzu, izvēlies pareizo variantu skaitu.', ranking: 'Lūdzu, sakārto šos.', signature: 'Lūdzu, paraksties.', file: 'Lūdzu, uzgaidi augšupielādi.' } }
  };
  FF.T = T;
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.6l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z"/></svg>';
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function shuffleOnce(arr, seed) {
    var a = arr.slice(), s = seed;
    for (var i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* FF.render(host, form, opts) -> {destroy, answers()}
     form: {slug, title, blocks, settings}; opts: {mode: 'live'|'preview'|'template', embed, params, onSubmit(answers, meta),
     onProgress(reached, answers), upload(file, blockId), onReport(), onRestart()} */
  FF.render = function (host, form, opts) {
    opts = opts || {};
    var s = form.settings || {}, blocks = form.blocks || [], t = T[s.lang] || T.en;
    var mode = opts.mode || 'live', focus = s.layout === 'focus';
    var byId = {}; blocks.forEach(function (b) { byId[b.id] = b; });
    var asked = blocks.filter(FF.isAsked), numOf = {};
    asked.forEach(function (b, i) { numOf[b.id] = (i + 1 < 10 ? '0' : '') + (i + 1); });
    var inputIndex = {}; blocks.filter(FF.isInput).forEach(function (b, i) { inputIndex[b.id] = i; });
    var draftKey = 'fillfox.d.' + form.slug, doneKey = 'fillfox.done.' + form.slug;
    var answers = {}, errors = {}, step = 0, anchor = null, started = false, reached = -1, t0 = Date.now(), uploading = 0, finished = false;
    var shuffled = {}, timers = [];
    var accent = s.accent || '#0a0a0a', ink = FF.inkOn(accent);
    var darkAccent = FF.contrast(accent, '#ffffff') > 9 || FF.contrast(accent, '#0b0b0b') < 1.6;

    // prefill from the link (?key=value) and hidden fields
    var params = opts.params || {};
    blocks.forEach(function (b) {
      if (!FF.isInput(b) || !(b.key in params)) return;
      var raw = String(params[b.key]);
      if (b.type === 'choice' || b.type === 'dropdown') {
        var o = (b.options || []).filter(function (x) { return x.id === raw || x.label.toLowerCase() === raw.toLowerCase(); })[0];
        if (o) answers[b.id] = o.id;
      } else if (b.type === 'multi') {
        var ids = raw.split(',').map(function (p) { p = p.trim().toLowerCase(); var o2 = (b.options || []).filter(function (x) { return x.label.toLowerCase() === p || x.id === p; })[0]; return o2 && o2.id; }).filter(Boolean);
        if (ids.length) answers[b.id] = ids;
      } else if (b.type === 'yesno') { if (/^(yes|no)$/i.test(raw)) answers[b.id] = raw.toLowerCase(); }
      else if (b.type === 'consent') { if (/^(1|true|yes)$/i.test(raw)) answers[b.id] = true; }
      else if (['number', 'rating', 'scale'].indexOf(b.type) >= 0) { if (!isNaN(parseFloat(raw))) answers[b.id] = parseFloat(raw); }
      else if (['file', 'signature', 'ranking', 'calc'].indexOf(b.type) < 0) answers[b.id] = raw.slice(0, 500);
    });

    var restored = false;
    if (mode === 'live') {
      try {
        var d = JSON.parse(localStorage.getItem(draftKey) || 'null');
        if (d && d.answers && Date.now() - d.t < 7 * 864e5 && Object.keys(d.answers).length) {
          Object.keys(d.answers).forEach(function (k) { if (byId[k] && !(byId[k].type === 'hidden' && k in answers)) answers[k] = d.answers[k]; });
          restored = true; started = true;
        }
      } catch (e) {}
    }

    host.innerHTML = '';
    var root = document.createElement('div');
    root.className = 'ffr ' + (focus ? 'focus' : 'classic') + ' f-' + (s.font || 'plex') + (s.align === 'center' ? ' center' : '') + (opts.embed ? ' embed' : '') + (darkAccent ? ' dark-accent' : '');
    root.style.setProperty('--a', accent);
    root.style.setProperty('--ai', ink);
    root.style.setProperty('--ff-font', (FF.FONTS[s.font] || FF.FONTS.plex)[1]);
    root.setAttribute('lang', s.lang || 'en');
    host.appendChild(root);

    function save() {
      if (mode !== 'live' || finished) return;
      try { localStorage.setItem(draftKey, JSON.stringify({ answers: answers, t: Date.now() })); } catch (e) {}
    }

    /* ---------------- block HTML */
    function lab(b, forId) {
      var req = b.required ? '<span class="ffr-req">(' + esc(t.required) + ')</span>' : '';
      var n = numOf[b.id] ? '<span class="ffr-n" aria-hidden="true">' + numOf[b.id] + '</span>' : '';
      var text = '<span data-pipe="' + esc(b.label || '') + '">' + esc(FF.pipe(b.label, blocks, answers)) + '</span>';
      return forId ? '<label class="ffr-lab" for="' + forId + '">' + n + text + req + '</label>' : '<legend>' + n + text + req + '</legend>';
    }
    function help(b) { return b.help ? '<p class="ffr-help" id="h-' + b.id + '">' + esc(b.help) + '</p>' : ''; }
    function described(b) { return (b.help ? 'h-' + b.id + ' ' : '') + 'e-' + b.id; }
    function err(b) { return '<p class="ffr-err" id="e-' + b.id + '" hidden></p>'; }
    function optsFor(b) {
      if (!b.props.shuffle) return b.options || [];
      if (!shuffled[b.id]) shuffled[b.id] = shuffleOnce(b.options || [], (Date.now() % 1000) + b.id.length);
      return shuffled[b.id];
    }

    function blockHtml(b) {
      var id = 'q-' + b.id, v = answers[b.id], p = b.props || {}, kind = b.type;
      var auto = { email: 'email', phone: 'tel', url: 'url' }[kind] || '';
      if (/name/.test(b.key) && kind === 'short') auto = /first/.test(b.key) ? 'given-name' : /last|family/.test(b.key) ? 'family-name' : 'name';
      var common = ' id="' + id + '" name="' + b.id + '" aria-describedby="' + described(b) + '"' + (b.required ? ' aria-required="true"' : '') +
        (b.placeholder ? ' placeholder="' + esc(b.placeholder) + '"' : '') + (auto ? ' autocomplete="' + auto + '"' : '');
      switch (kind) {
        case 'heading': return '<' + (p.size || 'h2') + ' class="ffr-heading" data-pipe="' + esc(b.label) + '">' + esc(FF.pipe(b.label, blocks, answers)) + '</' + (p.size || 'h2') + '>';
        case 'text': return '<div class="ffr-text" data-pipe-rich="' + esc(b.label) + '">' + FF.richText(FF.pipe(b.label, blocks, answers)) + '</div>';
        case 'divider': return '<hr>';
        case 'image': return p.url ? '<figure class="ffr-img" style="margin:0"><img src="' + esc(p.url) + '" alt="' + esc(p.alt || '') + '" loading="lazy"></figure>' : '';
        case 'page': return b.label ? '<div class="ffr-page-title">' + esc(b.label) + '</div>' : '';
        case 'hidden': return '';
        case 'calc':
          if (!p.show) return '';
          return '<div class="ffr-calc" aria-live="polite"><span>' + esc(b.label || 'Total') + '</span><b data-calc="' + b.id + '">' + esc((p.prefix || '') + FF.fmtNum(0, p.decimals)) + '</b></div>';
        case 'short': case 'email': case 'phone': case 'url': case 'number': case 'date': case 'time':
          var type = { short: 'text', email: 'email', phone: 'tel', url: 'url', number: 'number', date: 'date', time: 'time' }[kind];
          var extra = kind === 'number' ? (p.min != null ? ' min="' + p.min + '"' : '') + (p.max != null ? ' max="' + p.max + '"' : '') + ' inputmode="decimal" step="any"' : '';
          if (kind === 'short' && p.maxlen) extra += ' maxlength="' + p.maxlen + '"';
          if (kind === 'url' && !b.placeholder) extra += ' placeholder="https://"';
          var input = '<input type="' + type + '"' + common + extra + ' value="' + esc(v == null ? '' : v) + '">';
          if (kind === 'number' && p.unit) input = '<div class="ffr-unit">' + input + '<span>' + esc(p.unit) + '</span></div>';
          return '<div class="ffr-q">' + lab(b, id) + help(b) + input + err(b) + '</div>';
        case 'long':
          return '<div class="ffr-q">' + lab(b, id) + help(b) + '<textarea' + common + (p.maxlen ? ' maxlength="' + p.maxlen + '"' : '') + '>' + esc(v || '') + '</textarea>' +
            (p.maxlen ? '<div class="ffr-count" data-count="' + b.id + '">' + String(v || '').length + ' / ' + p.maxlen + '</div>' : '') + err(b) + '</div>';
        case 'dropdown':
          return '<div class="ffr-q">' + lab(b, id) + help(b) + '<select' + common + '><option value="">' + esc(t.choose) + '</option>' +
            optsFor(b).map(function (o) { return '<option value="' + esc(o.id) + '"' + (v === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>' + err(b) + '</div>';
        case 'choice': case 'multi':
          var multi = kind === 'multi', list = optsFor(b), vals = multi ? (v || []) : [v];
          var other = (vals || []).filter(function (x) { return typeof x === 'string' && x.indexOf('other:') === 0; })[0];
          var html = list.map(function (o, i) {
            return '<label class="ffr-opt ' + (multi ? 'check' : 'radio') + '"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + b.id + '" value="' + esc(o.id) + '"' +
              (vals.indexOf(o.id) >= 0 ? ' checked' : '') + '><span>' + (focus && i < 26 ? '<kbd aria-hidden="true">' + LETTERS[i] + '</kbd>' : '<i class="box" aria-hidden="true"></i>') + esc(o.label) + '</span></label>';
          }).join('');
          if (p.other) html += '<label class="ffr-opt ' + (multi ? 'check' : 'radio') + '"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + b.id + '" value="__other"' + (other ? ' checked' : '') + '><span>' +
            (focus && list.length < 26 ? '<kbd aria-hidden="true">' + LETTERS[list.length] + '</kbd>' : '<i class="box" aria-hidden="true"></i>') + esc(t.other) + '</span></label>';
          return '<fieldset class="ffr-q" aria-describedby="' + described(b) + '">' + lab(b) + help(b) + '<div class="ffr-opts' + (list.length > 6 && !focus ? ' cols' : '') + '">' + html + '</div>' +
            (p.other ? '<input type="text" class="ffr-other" data-other="' + b.id + '" aria-label="' + esc(t.other) + '" placeholder="' + esc(t.otherPh) + '" value="' + esc(other ? other.slice(6) : '') + '"' + (other ? '' : ' hidden') + '>' : '') + err(b) + '</fieldset>';
        case 'yesno':
          return '<fieldset class="ffr-q" aria-describedby="' + described(b) + '">' + lab(b) + help(b) + '<div class="ffr-yn">' + [['yes', t.yes, 'Y'], ['no', t.no, 'N']].map(function (o) {
            return '<label class="ffr-opt radio"><input type="radio" name="' + b.id + '" value="' + o[0] + '"' + (v === o[0] ? ' checked' : '') + '><span>' + (focus ? '<kbd aria-hidden="true">' + o[2] + '</kbd>' : '') + esc(o[1]) + '</span></label>';
          }).join('') + '</div>' + err(b) + '</fieldset>';
        case 'rating':
          var max = p.max || 5, stars = '';
          for (var i = 1; i <= max; i++) stars += '<label class="' + (v >= i ? 'on' : '') + '" data-star="' + i + '"><input type="radio" name="' + b.id + '" value="' + i + '"' + (v === i ? ' checked' : '') + ' aria-label="' + i + ' ' + t.of + ' ' + max + '">' + STAR + '</label>';
          return '<fieldset class="ffr-q" aria-describedby="' + described(b) + '">' + lab(b) + help(b) + '<div class="ffr-stars">' + stars + '</div>' + err(b) + '</fieldset>';
        case 'scale':
          var lo = p.min == null ? 0 : p.min, hi = p.max == null ? 10 : p.max, cells = '';
          for (var k = lo; k <= hi; k++) cells += '<label><input type="radio" name="' + b.id + '" value="' + k + '"' + (v === k ? ' checked' : '') + ' aria-label="' + k + (k === lo && p.low ? ' (' + esc(p.low) + ')' : k === hi && p.high ? ' (' + esc(p.high) + ')' : '') + '"><span>' + k + '</span></label>';
          var n = hi - lo + 1;
          return '<fieldset class="ffr-q" aria-describedby="' + described(b) + '">' + lab(b) + help(b) + '<div class="ffr-scale" style="--n:' + n + ';--nm:' + (n > 6 ? Math.ceil(n / 2) : n) + '">' + cells + '</div>' +
            (p.low || p.high ? '<div class="ffr-ends" aria-hidden="true"><span>' + esc(p.low || '') + '</span><span>' + esc(p.high || '') + '</span></div>' : '') + err(b) + '</fieldset>';
        case 'ranking':
          var order = Array.isArray(v) && v.length ? v : (b.options || []).map(function (o) { return o.id; });
          return '<fieldset class="ffr-q" aria-describedby="' + described(b) + '">' + lab(b) + help(b) + '<ol class="ffr-rank" data-rank="' + b.id + '">' + order.map(function (oid, i) {
            return '<li data-oid="' + esc(oid) + '"><b>' + (i + 1) + '</b><span>' + esc(FF.optLabel(b, oid)) + '</span>' +
              '<button type="button" data-move="-1" aria-label="' + esc(t.up + ': ' + FF.optLabel(b, oid)) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
              '<button type="button" data-move="1" aria-label="' + esc(t.down + ': ' + FF.optLabel(b, oid)) + '"' + (i === order.length - 1 ? ' disabled' : '') + '>↓</button></li>';
          }).join('') + '</ol>' + (Array.isArray(v) ? '' : '<p style="margin:8px 0 0"><button type="button" class="ffr-mini" data-keep="' + b.id + '">' + esc(t.keep) + '</button></p>') + err(b) + '</fieldset>';
        case 'file':
          return '<div class="ffr-q">' + lab(b, id) + help(b) + '<label class="ffr-drop" data-drop="' + b.id + '"><input type="file"' + common + ((p.max_files || 1) > 1 ? ' multiple' : '') + '>' +
            UI.icon('upload') + ' <span>' + esc(t.upload) + '</span><br><span class="ffr-hint">10 MB · PDF, images, office files, zip</span></label><ul class="ffr-files" data-files="' + b.id + '"></ul>' + err(b) + '</div>';
        case 'signature':
          var typed = v && v.kind === 'type';
          return '<fieldset class="ffr-q ffr-sig" aria-describedby="' + described(b) + '">' + lab(b) + help(b) +
            '<div class="ffr-sig-tabs" role="tablist"><button type="button" role="tab" data-sigmode="type" aria-selected="' + (typed || !v ? 'true' : 'false') + '" class="' + (typed || !v ? 'on' : '') + '">' + esc(t.type) + '</button>' +
            '<button type="button" role="tab" data-sigmode="draw" aria-selected="' + (v && v.kind === 'draw' ? 'true' : 'false') + '" class="' + (v && v.kind === 'draw' ? 'on' : '') + '">' + esc(t.draw) + '</button></div>' +
            '<div data-sigtype ' + (v && v.kind === 'draw' ? 'hidden' : '') + '><input type="text" data-signame="' + b.id + '" aria-label="' + esc(t.signName) + '" placeholder="' + esc(t.signName) + '" autocomplete="name" value="' + esc(typed ? v.name : '') + '"><div class="typed" aria-hidden="true">' + esc(typed ? v.name : '') + '</div></div>' +
            '<div data-sigdraw ' + (v && v.kind === 'draw' ? '' : 'hidden') + '><canvas width="640" height="180" data-canvas="' + b.id + '" aria-label="' + esc(t.signDraw) + '" role="img"></canvas>' +
            '<div class="ffr-sig-row"><span>' + esc(t.signDraw) + '</span><button type="button" class="ffr-mini" data-sigclear="' + b.id + '">' + esc(t.clear) + '</button></div></div>' + err(b) + '</fieldset>';
        case 'payment':
          var pl = FF.paymentLink(b, answers), paidNow = v && v.confirmed;
          if (!pl.url) return '<div class="ffr-q"><div class="ffr-lab" style="font-weight:600;margin-bottom:8px">' + lab(b, null).replace(/^<legend>|<\/legend>$/g, '') + '</div><div class="ffr-pay"><span class="ffr-hint" style="font-size:.9rem">' + esc(pl.needs ? t.payChoose : 'Payment is not set up yet.') + '</span></div>' + err(b) + '</div>';
          var href = pl.url + (pl.url.indexOf('?') >= 0 ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(opts.token || 'preview') + (payEmail() ? '&prefilled_email=' + encodeURIComponent(payEmail()) : '');
          return '<fieldset class="ffr-q" aria-describedby="' + described(b) + '">' + lab(b) + help(b) + '<div class="ffr-pay"><div class="ffr-pay-top"><span class="ffr-pay-amt">' + esc(pl.amount || '') + '</span>' +
            '<a class="ffr-btn" href="' + esc(href) + '" target="_blank" rel="noopener" data-paylink="' + b.id + '">' + UI.icon('external') + esc((b.props.button || t.pay) + (pl.amount && !b.props.button ? ' ' + pl.amount : '')) + '</a></div>' +
            '<span class="ffr-hint">' + esc(t.payNote) + '</span>' +
            '<label class="ffr-consent"><input type="checkbox" name="' + b.id + '" data-paid' + (paidNow ? ' checked' : '') + '><span>' + esc(t.paid) + '</span></label></div>' + err(b) + '</fieldset>';
        case 'consent':
          return '<div class="ffr-q"><label class="ffr-consent"><input type="checkbox" name="' + b.id + '" id="' + id + '" aria-describedby="' + described(b) + '"' + (v ? ' checked' : '') + '><span>' +
            FF.richText(b.label || '') + (b.required ? ' <span class="ffr-req">(' + esc(t.required) + ')</span>' : '') + '</span></label>' + help(b) + err(b) + '</div>';
      }
      return '';
    }

    function payEmail() { var e = blocks.filter(function (x) { return x.type === 'email' && answers[x.id]; })[0]; return e ? answers[e.id] : ''; }

    /* ---------------- steps */
    function shows(b) { return b.type !== 'hidden' && !(b.type === 'calc' && !(b.props || {}).show); }
    function steps() {
      var vis = FF.visible(blocks, answers), out = [], cur = [], pending = [];
      if (!focus) {
        blocks.forEach(function (b) {
          if (!vis[b.id]) return;
          if (b.type === 'page') { if (cur.length) out.push(cur); cur = b.label ? [b.id] : []; return; }
          if (shows(b)) cur.push(b.id);
        });
        if (cur.length) out.push(cur);
      } else {
        blocks.forEach(function (b) {
          if (!vis[b.id] || !shows(b)) return;
          if (b.type === 'page') { if (b.label) pending.push(b.id); return; }
          if (FF.isInput(b) || b.type === 'calc') { out.push(pending.concat([b.id])); pending = []; }
          else pending.push(b.id);
        });
        if (pending.length) { if (out.length) out[out.length - 1] = out[out.length - 1].concat(pending); else out.push(pending); }
      }
      return out.length ? out : [[]];
    }

    /* ---------------- frame */
    var preview = mode === 'preview' ? '<div class="ffr-preview-bar">PREVIEW · answers are not saved</div>' : '';
    var head = '<header class="ffr-head"><h1 tabindex="-1">' + esc(form.title || 'Untitled form') + '</h1>' + (s.description ? '<p class="desc">' + FF.richText(s.description) + '</p>' : '') +
      '<p class="meta">' + asked.length + ' QUESTION' + (asked.length === 1 ? '' : 'S') + ' · ~' + FF.minutes(blocks) + ' ' + esc(t.min.toUpperCase()) + '</p></header>';
    var foot = '<footer class="ffr-foot">' +
      '<a class="brand" href="' + esc(location.origin + location.pathname) + '#landing" target="_blank" rel="noopener"><img src="_/theme/icon.svg" alt="">' + esc(t.made) + '</a>' +
      '<span>' + esc(t.noPw) + '</span>' + (mode === 'live' ? '<button type="button" data-report>' + esc(t.report) + '</button>' : '') +
      (s.privacy_contact ? '<span>' + esc(t.privacy) + ': ' + esc(s.privacy_contact) + '</span>' : '') + '</footer>';

    function showStep(dir) {
      var all = steps();
      if (anchor) { var idx = -1; all.forEach(function (st, i) { if (st.indexOf(anchor) >= 0) idx = i; }); if (idx >= 0) step = idx; }
      step = Math.max(0, Math.min(step, all.length - 1));
      var ids = all[step];
      anchor = ids[ids.length - 1] || null;
      var last = step === all.length - 1;
      var showHead = !focus || step === 0;
      var body = root.querySelector('.ffr-in');
      body.innerHTML = (s.progress !== false && all.length > 1 ? '<div class="ffr-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + all.length + '" aria-valuenow="' + (step + 1) + '" aria-label="Step ' + (step + 1) + ' ' + t.of + ' ' + all.length + '"><i style="width:' + Math.round(100 * (step + (finished ? 1 : 0.5)) / all.length) + '%"></i></div>' : '') +
        (showHead ? head : '') +
        (restored && step === 0 ? '<div class="ffr-notice"><span>' + esc(t.kept) + '</span><button type="button" data-restart>' + esc(t.startOver) + '</button></div>' : '') +
        '<form class="ffr-form" novalidate><div class="ffr-errors" tabindex="-1" hidden></div><div class="step-in">' +
        ids.map(function (bid) { var b = byId[bid]; return '<div class="ffr-b" data-id="' + bid + '" data-type="' + b.type + '">' + blockHtml(b) + '</div>'; }).join('') +
        '</div><div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Leave this empty<input type="text" name="ffr_hp" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="ffr-nav">' + (step > 0 ? '<button type="button" class="ffr-btn ghost" data-back>' + UI.icon('back') + esc(t.back) + '</button>' : '') +
        '<button type="submit" class="ffr-btn">' + esc(last ? (s.button || t.submit) : t.next) + (last ? '' : UI.icon('arrow')) + '</button>' +
        (focus && !last ? '<span class="ffr-hint">' + esc(t.enter) + '</span>' : '') + '</div></form>' + foot;
      ids.forEach(function (bid) {
        var b = byId[bid];
        if (b.type === 'file') drawFiles(b);
        if (b.type === 'signature') wireCanvas(b);
      });
      refresh();
      if (dir) {
        if (!opts.embed) { var top = root.getBoundingClientRect().top + window.scrollY - 8; if (window.scrollY > top) window.scrollTo(0, Math.max(0, top)); }
        var first = body.querySelector('.ffr-b input:not([type=hidden]):not([name=ffr_hp]), .ffr-b textarea, .ffr-b select');
        if (focus && first && first.type !== 'radio' && first.type !== 'checkbox' && first.type !== 'file') first.focus({ preventScroll: true });
        else { var h = body.querySelector('.ffr-head h1, .ffr-b'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
      }
      var lastInput = -1;
      ids.forEach(function (bid) { if (bid in inputIndex) lastInput = Math.max(lastInput, inputIndex[bid]); });
      if (started && lastInput > reached && focus) { reached = lastInput; progress(); }
      sizePost();
    }

    /* Recompute logic, piping and calculations without redrawing the step. */
    function refresh() {
      var vis = FF.visible(blocks, answers);
      root.querySelectorAll('.ffr-b').forEach(function (el) { el.hidden = !vis[el.getAttribute('data-id')]; });
      root.querySelectorAll('[data-pipe]').forEach(function (el) { el.textContent = FF.pipe(el.getAttribute('data-pipe'), blocks, answers); });
      root.querySelectorAll('[data-pipe-rich]').forEach(function (el) { el.innerHTML = FF.richText(FF.pipe(el.getAttribute('data-pipe-rich'), blocks, answers)); });
      var sc = FF.score(blocks, answers, vis), calc = FF.calc(blocks, answers, sc.got);
      Object.keys(calc).forEach(function (k) {
        answers[k] = calc[k];
        var el = root.querySelector('[data-calc="' + k + '"]');
        if (el) el.textContent = (byId[k].props.prefix || '') + FF.fmtNum(calc[k], byId[k].props.decimals);
      });
      // a page that logic hides can make this step the last one: keep the button text right
      var all = steps(), btn = root.querySelector('.ffr-nav [type=submit]');
      if (btn && !btn.disabled) {
        var last = step >= all.length - 1;
        btn.innerHTML = esc(last ? (s.button || t.submit) : t.next) + (last ? '' : UI.icon('arrow'));
      }
    }

    function sizePost() {
      if (!opts.embed || window.parent === window) return;
      setTimeout(function () { try { window.parent.postMessage({ fillfox: 'height', slug: form.slug, height: document.documentElement.scrollHeight }, '*'); } catch (e) {} }, 60);
    }

    var progTimer = null;
    function progress() {
      if (mode !== 'live' || !opts.onProgress) return;
      clearTimeout(progTimer);
      progTimer = setTimeout(function () { opts.onProgress(reached, answers); }, 1500);
    }
    function touched(bid) {
      if (!started) { started = true; }
      if (bid in inputIndex && inputIndex[bid] > reached) reached = inputIndex[bid];
      progress();
      save();
    }

    /* ---------------- validation */
    function check(ids) {
      var vis = FF.visible(blocks, answers), out = {};
      ids.forEach(function (bid) {
        var b = byId[bid], v = answers[bid], p = b.props || {};
        if (!vis[bid] || !FF.isAsked(b)) return;
        var e = null, empty = FF.isEmpty(v);
        if (b.type === 'file' && uploading) e = 'file';
        else if (empty) e = b.required ? (b.type === 'ranking' ? 'ranking' : b.type === 'signature' ? 'signature' : 'required') : null;
        else if (b.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) e = 'email';
        else if (b.type === 'phone' && !/^[0-9+()\-.\s]{6,30}$/.test(v)) e = 'phone';
        else if (b.type === 'url' && !/^(https?:\/\/)?[^\s]+\.[^\s]+$/i.test(v)) e = 'url';
        else if (b.type === 'number') { var n = parseFloat(v); if (isNaN(n)) e = 'number'; else if ((p.min != null && n < p.min) || (p.max != null && n > p.max)) e = 'range'; }
        else if (b.type === 'multi' && ((p.min && v.length < p.min) || (p.max && v.length > p.max))) e = 'count';
        if (b.type === 'payment' && b.required && !(v && v.confirmed)) e = FF.paymentLink(b, answers).url ? 'payment' : 'payment_choice';
        else if ((b.type === 'choice' || b.type === 'multi') && [].concat(v).some(function (x) { return x === 'other:'; })) e = 'required';
        if (e) out[bid] = e;
      });
      return out;
    }
    function errText(b, code) {
      var p = b.props || {};
      if (code === 'range') return t.e.range + (p.min != null && p.max != null ? ' (' + p.min + '–' + p.max + ')' : p.min != null ? ' (≥ ' + p.min + ')' : p.max != null ? ' (≤ ' + p.max + ')' : '');
      if (code === 'count') return t.e.count + (p.min && p.max ? ' (' + p.min + '–' + p.max + ')' : p.min ? ' (≥ ' + p.min + ')' : ' (≤ ' + p.max + ')');
      return t.e[code] || t.e.required;
    }
    function showErrors(errs) {
      errors = errs;
      var box = root.querySelector('.ffr-errors'), keys = Object.keys(errs);
      root.querySelectorAll('.ffr-err').forEach(function (el) { el.hidden = true; el.textContent = ''; });
      root.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
      keys.forEach(function (bid) {
        var el = root.querySelector('#e-' + bid);
        if (el) { el.hidden = false; el.textContent = errText(byId[bid], errs[bid]); }
        var f = root.querySelector('#q-' + bid); if (f) f.setAttribute('aria-invalid', 'true');
      });
      if (!box) return;
      if (keys.length > 1 || (keys.length && !focus)) {
        box.hidden = false;
        box.innerHTML = '<h2>' + esc(t.fix) + '</h2><ul>' + keys.map(function (bid) { return '<li><a href="#q-' + bid + '" data-jump="' + bid + '">' + esc(FF.pipe(byId[bid].label, blocks, answers) || byId[bid].key) + '</a>: ' + esc(errText(byId[bid], errs[bid])) + '</li>'; }).join('') + '</ul>';
        box.focus();
      } else {
        box.hidden = true;
        if (keys.length) { var f2 = root.querySelector('#q-' + keys[0] + ', .ffr-b[data-id="' + keys[0] + '"] input'); if (f2) f2.focus(); }
      }
      sizePost();
    }

    /* ---------------- reading inputs */
    function readGroup(bid) {
      var b = byId[bid];
      var boxes = Array.prototype.slice.call(root.querySelectorAll('input[name="' + bid + '"]'));
      if (b.type === 'multi') {
        var other = root.querySelector('[data-other="' + bid + '"]');
        var vals = boxes.filter(function (x) { return x.checked; }).map(function (x) { return x.value === '__other' ? 'other:' + (other ? other.value.trim() : '') : x.value; });
        if (other) other.hidden = !boxes.some(function (x) { return x.value === '__other' && x.checked; });
        answers[bid] = vals.length ? vals : undefined;
      } else if (b.type === 'choice') {
        var on = boxes.filter(function (x) { return x.checked; })[0], oth = root.querySelector('[data-other="' + bid + '"]');
        if (oth) oth.hidden = !(on && on.value === '__other');
        answers[bid] = on ? (on.value === '__other' ? 'other:' + (oth ? oth.value.trim() : '') : on.value) : undefined;
      } else if (b.type === 'yesno') {
        var y = boxes.filter(function (x) { return x.checked; })[0]; answers[bid] = y ? y.value : undefined;
      } else if (b.type === 'rating' || b.type === 'scale') {
        var r = boxes.filter(function (x) { return x.checked; })[0]; answers[bid] = r ? +r.value : undefined;
        if (b.type === 'rating') root.querySelectorAll('.ffr-b[data-id="' + bid + '"] [data-star]').forEach(function (l) { l.classList.toggle('on', +l.getAttribute('data-star') <= (answers[bid] || 0)); });
      } else if (b.type === 'consent') {
        answers[bid] = boxes[0] && boxes[0].checked ? true : undefined;
      } else if (b.type === 'payment') {
        answers[bid] = boxes[0] && boxes[0].checked ? { confirmed: true } : undefined;
      }
    }
    function onInput(e) {
      var el = e.target, wrap = el.closest('.ffr-b'); if (!wrap) return;
      var bid = wrap.getAttribute('data-id'), b = byId[bid];
      if (el.name === 'ffr_hp') return;
      if (el.hasAttribute('data-other')) { readGroup(bid); }
      else if (el.hasAttribute('data-signame')) {
        var nm = el.value.trim(); wrap.querySelector('.typed').textContent = el.value;
        answers[bid] = nm ? { kind: 'type', name: nm } : undefined;
      } else if (['choice', 'multi', 'yesno', 'rating', 'scale', 'consent', 'payment'].indexOf(b.type) >= 0) readGroup(bid);
      else if (b.type === 'file') { if (e.type === 'change') addFiles(b, el.files); return; }
      else if (b.type === 'number') answers[bid] = el.value === '' ? undefined : el.value;
      else answers[bid] = el.value === '' ? undefined : el.value;
      if (b.type === 'long' && b.props.maxlen) { var c = root.querySelector('[data-count="' + bid + '"]'); if (c) c.textContent = el.value.length + ' / ' + b.props.maxlen; }
      if (errors[bid]) { var ne = check([bid]); var el2 = root.querySelector('#e-' + bid); if (!ne[bid] && el2) { el2.hidden = true; delete errors[bid]; var f = root.querySelector('#q-' + bid); if (f) f.removeAttribute('aria-invalid'); } }
      touched(bid);
      blocks.forEach(function (pb) {
        if (pb.type !== 'payment' || !pb.props || (pb.props.by !== bid && b.type !== 'email')) return;
        var w = root.querySelector('.ffr-b[data-id="' + pb.id + '"]'); if (w) w.innerHTML = blockHtml(pb);
      });
      refresh();
      // one question at a time: a single pick moves on by itself
      if (focus && e.type === 'change' && ['choice', 'yesno', 'rating', 'scale'].indexOf(b.type) >= 0 && !(b.type === 'choice' && answers[bid] && String(answers[bid]).indexOf('other:') === 0)) {
        var cur = steps()[step] || [], inputsHere = cur.filter(function (x) { return FF.isAsked(byId[x]); });
        if (inputsHere.length === 1 && step < steps().length - 1) { clearTimeout(timers[0]); timers[0] = setTimeout(function () { if (!finished) next(); }, 380); }
      }
    }

    /* ---------------- files */
    function drawFiles(b) {
      var ul = root.querySelector('[data-files="' + b.id + '"]'); if (!ul) return;
      ul.innerHTML = (answers[b.id] || []).map(function (f, i) {
        return '<li>' + UI.icon('check') + '<span>' + esc(f.name) + ' <span class="ffr-hint">' + (f.size / 1048576).toFixed(1) + ' MB</span></span><button type="button" class="ffr-mini" data-rmfile="' + i + '">' + esc(t.remove) + '</button></li>';
      }).join('') + (uploading ? '<li><span>' + esc(t.uploading) + '</span></li>' : '');
    }
    function addFiles(b, files) {
      var max = b.props.max_files || 1, have = answers[b.id] || [];
      Array.prototype.slice.call(files || []).slice(0, Math.max(0, max - have.length)).forEach(function (file) {
        if (file.size > 10 * 1048576) { UI.toast('“' + file.name + '” is over 10 MB.', 'error'); return; }
        if (!opts.upload) { answers[b.id] = (answers[b.id] || []).concat([{ key: 'preview' + FF.uid(6), name: file.name, size: file.size }]); drawFiles(b); touched(b.id); return; }
        uploading++; drawFiles(b);
        opts.upload(file, b.id).then(function (r) {
          uploading--; answers[b.id] = (answers[b.id] || []).concat([r.file]); drawFiles(b); touched(b.id);
        }, function (e) { uploading--; drawFiles(b); UI.toast(e.message || 'Upload failed', 'error'); });
      });
    }

    /* ---------------- signature canvas */
    function wireCanvas(b) {
      var c = root.querySelector('[data-canvas="' + b.id + '"]'); if (!c) return;
      var ctx = c.getContext('2d'), drawing = false, last = null, dirty = false;
      var v = answers[b.id];
      if (v && v.kind === 'draw') { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0); }; img.src = v.data; }
      function pt(e) { var r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; }
      c.addEventListener('pointerdown', function (e) { drawing = true; last = pt(e); c.setPointerCapture(e.pointerId); });
      c.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        var p = pt(e);
        ctx.strokeStyle = getComputedStyle(root).color || '#0a0a0a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; dirty = true;
      });
      var end = function () {
        if (!drawing) return; drawing = false;
        if (dirty) { answers[b.id] = { kind: 'draw', data: c.toDataURL('image/png') }; touched(b.id); }
      };
      c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('pointerleave', end);
      c._clear = function () { ctx.clearRect(0, 0, c.width, c.height); dirty = false; };
    }

    /* ---------------- navigation and sending */
    function next() {
      var all = steps(), ids = all[step] || [];
      var errs = check(ids);
      if (Object.keys(errs).length) { showErrors(errs); return; }
      if (step >= all.length - 1) return send();
      step++; anchor = all[step][all[step].length - 1];
      if (!started) started = true;
      showStep(1);
    }
    function back() { var all = steps(); step = Math.max(0, step - 1); anchor = (all[step] || [])[0]; anchor = all[step][all[step].length - 1]; showStep(-1); }

    function clean() {
      var vis = FF.visible(blocks, answers), out = {};
      blocks.forEach(function (b) {
        if (!FF.isInput(b) || !vis[b.id] || FF.isEmpty(answers[b.id])) return;
        var v = answers[b.id];
        if (b.type === 'number') v = parseFloat(v);
        out[b.id] = v;
      });
      return out;
    }
    function send() {
      var btn = root.querySelector('.ffr-nav [type=submit]'), hp = root.querySelector('[name=ffr_hp]');
      var meta = { ms: Date.now() - t0, hp: hp ? hp.value : '', device: innerWidth < 700 ? 'phone' : innerWidth < 1100 ? 'tablet' : 'desktop', lang: s.lang || 'en', embed: !!opts.embed };
      if (btn) { btn.disabled = true; btn.textContent = t.sending; }
      var done = opts.onSubmit ? opts.onSubmit(clean(), meta) : Promise.resolve(local());
      return Promise.resolve(done).then(function (r) {
        finished = true;
        try { localStorage.removeItem(draftKey); if (mode === 'live') localStorage.setItem(doneKey, String(Date.now())); } catch (e) {}
        ending(r || {});
      }, function (e) {
        if (btn) { btn.disabled = false; btn.textContent = s.button || t.submit; }
        var res = e && e.result;
        if (res && res.errors) {
          var all = steps(), first = Object.keys(res.errors)[0], idx = -1;
          all.forEach(function (st, i) { if (idx < 0 && st.indexOf(first) >= 0) idx = i; });
          if (idx >= 0 && idx !== step) { step = idx; anchor = all[idx][all[idx].length - 1]; showStep(1); }
          showErrors(res.errors);
        } else UI.toast((e && e.message) || 'That didn\'t send. Please try again.', 'error');
      });
    }
    function local() {   // preview and templates: work out the ending here
      var vis = FF.visible(blocks, answers), sc = FF.score(blocks, answers, vis), endings = s.endings || [], chosen = endings[0];
      if (s.quiz && sc.max) {
        var scored = endings.filter(function (e) { return e.min_score != null; }).sort(function (a, b) { return b.min_score - a.min_score; });
        chosen = scored.filter(function (e) { return sc.got >= e.min_score; })[0] || endings.filter(function (e) { return e.min_score == null; })[0] || chosen;
      }
      return { ending: chosen || { title: t.thanks, text: '' }, score: s.quiz && s.show_score && sc.max ? sc : null };
    }
    function ending(r) {
      var e = r.ending || { title: t.thanks, text: '' }, score = r.score;
      var extra = score ? { score: String(score.got) } : {};
      var body = root.querySelector('.ffr-in');
      body.innerHTML = (s.progress !== false ? '<div class="ffr-progress"><i style="width:100%"></i></div>' : '') +
        '<div class="ffr-end" role="status"><div class="tick">' + UI.icon('check') + '</div>' +
        (score ? '<div class="ffr-score">' + score.got + '<small>/ ' + score.max + ' · ' + esc(t.score) + '</small></div>' : '') +
        '<h2 tabindex="-1">' + esc(FF.pipe(e.title, blocks, answers, extra)) + '</h2>' + (e.text ? '<p>' + FF.richText(FF.pipe(e.text, blocks, answers, extra)) + '</p>' : '') +
        (e.redirect && mode === 'live' ? '<p class="ffr-hint">' + esc(t.redirect) + ' <a href="' + esc(e.redirect) + '" rel="noopener nofollow">' + esc(e.redirect) + '</a></p>' : '') +
        (mode !== 'live' ? '<p><button type="button" class="ffr-btn ghost" data-again>' + UI.icon('refresh') + 'Fill it again</button></p>' : '') + '</div>' + foot;
      var h = body.querySelector('h2'); if (h) h.focus({ preventScroll: true });
      if (e.redirect && mode === 'live') timers.push(setTimeout(function () { (window.top || window).location.href = e.redirect; }, 3500));
      if (opts.onDone) opts.onDone(r);
      sizePost();
    }

    /* ---------------- events */
    function onClick(e) {
      var el = e.target;
      if (el.closest('[data-back]')) { e.preventDefault(); back(); return; }
      if (el.closest('[data-restart]')) {
        e.preventDefault(); answers = {}; restored = false; try { localStorage.removeItem(draftKey); } catch (x) {}
        if (opts.onRestart) opts.onRestart(); step = 0; anchor = null; showStep(1); return;
      }
      if (el.closest('[data-again]')) { e.preventDefault(); answers = {}; finished = false; step = 0; anchor = null; t0 = Date.now(); showStep(1); return; }
      if (el.closest('[data-report]')) { e.preventDefault(); if (opts.onReport) opts.onReport(); return; }
      if (el.closest('[data-paylink]') && opts.onPayOpen) opts.onPayOpen();
      var j = el.closest('[data-jump]');
      if (j) { e.preventDefault(); var f = root.querySelector('#q-' + j.getAttribute('data-jump')) || root.querySelector('.ffr-b[data-id="' + j.getAttribute('data-jump') + '"] input'); if (f) f.focus(); return; }
      var mv = el.closest('[data-move]');
      if (mv) {
        var ol = mv.closest('[data-rank]'), bid = ol.getAttribute('data-rank'), order = Array.prototype.map.call(ol.children, function (li) { return li.getAttribute('data-oid'); });
        var i = order.indexOf(mv.closest('li').getAttribute('data-oid')), k = i + (+mv.getAttribute('data-move'));
        if (k < 0 || k >= order.length) return;
        order.splice(k, 0, order.splice(i, 1)[0]); answers[bid] = order; touched(bid);
        var wrap = ol.closest('.ffr-b'); wrap.innerHTML = blockHtml(byId[bid]);
        var again = wrap.querySelectorAll('[data-move="' + mv.getAttribute('data-move') + '"]')[k]; if (again && !again.disabled) again.focus(); else { var any = wrap.querySelectorAll('li')[k]; if (any) any.querySelector('button:not([disabled])').focus(); }
        return;
      }
      var keep = el.closest('[data-keep]');
      if (keep) { var kb = keep.getAttribute('data-keep'); answers[kb] = (byId[kb].options || []).map(function (o) { return o.id; }); touched(kb); keep.closest('p').remove(); return; }
      var rm = el.closest('[data-rmfile]');
      if (rm) { var fb = rm.closest('.ffr-b').getAttribute('data-id'); answers[fb].splice(+rm.getAttribute('data-rmfile'), 1); if (!answers[fb].length) delete answers[fb]; drawFiles(byId[fb]); save(); return; }
      var sm = el.closest('[data-sigmode]');
      if (sm) {
        var w = sm.closest('.ffr-b'), m = sm.getAttribute('data-sigmode');
        w.querySelectorAll('[data-sigmode]').forEach(function (x) { x.classList.toggle('on', x === sm); x.setAttribute('aria-selected', String(x === sm)); });
        w.querySelector('[data-sigtype]').hidden = m !== 'type'; w.querySelector('[data-sigdraw]').hidden = m !== 'draw';
        return;
      }
      var sc = el.closest('[data-sigclear]');
      if (sc) { var cv = root.querySelector('[data-canvas="' + sc.getAttribute('data-sigclear') + '"]'); if (cv && cv._clear) cv._clear(); delete answers[sc.getAttribute('data-sigclear')]; save(); }
    }
    function onKey(e) {
      if (finished) return;
      var tag = (e.target.tagName || '').toLowerCase(), typing = (tag === 'input' && ['text', 'email', 'tel', 'url', 'number', 'date', 'time'].indexOf(e.target.type) >= 0) || tag === 'textarea' || tag === 'select';
      if (e.key === 'Enter' && focus && tag !== 'textarea' && tag !== 'button' && !e.shiftKey && root.contains(e.target)) { e.preventDefault(); next(); return; }
      if (!focus || typing || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      var ids = (steps()[step] || []).filter(function (x) { return ['choice', 'multi', 'yesno'].indexOf(byId[x].type) >= 0; });
      if (ids.length !== 1) return;
      var b = byId[ids[0]], letter = e.key.toUpperCase(), boxes = root.querySelectorAll('input[name="' + b.id + '"]');
      var i = b.type === 'yesno' ? ({ Y: 0, N: 1, O: 0 }[letter]) : LETTERS.indexOf(letter);
      if (i == null || i < 0 || !boxes[i]) return;
      e.preventDefault();
      boxes[i].checked = b.type === 'multi' ? !boxes[i].checked : true;
      boxes[i].dispatchEvent(new Event('change', { bubbles: true }));
    }
    function onSubmitEv(e) { if (e.target.closest('.ffr-form')) { e.preventDefault(); next(); } }
    function onDrag(e) {
      var d = e.target.closest && e.target.closest('[data-drop]'); if (!d) return;
      e.preventDefault();
      d.classList.toggle('over', e.type === 'dragover');
      if (e.type === 'drop') addFiles(byId[d.getAttribute('data-drop')], e.dataTransfer.files);
    }

    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmitEv);
    root.addEventListener('dragover', onDrag); root.addEventListener('dragleave', onDrag); root.addEventListener('drop', onDrag);
    document.addEventListener('keydown', onKey);

    root.innerHTML = preview + '<div class="ffr-cover ' + (s.cover || 'band') + '" aria-hidden="true"></div><div class="ffr-in"></div>';
    if (mode === 'live' && s.one_per_device) {
      var doneAt = null; try { doneAt = localStorage.getItem(doneKey); } catch (e) {}
      if (doneAt) {
        root.querySelector('.ffr-in').innerHTML = head + '<div class="ffr-end"><div class="tick">' + UI.icon('check') + '</div><h2>' + esc(t.already) + '</h2></div>' + foot;
        sizePost();
        return { destroy: function () { document.removeEventListener('keydown', onKey); }, answers: function () { return answers; } };
      }
    }
    showStep(0);
    if (opts.embed && window.ResizeObserver) { try { new ResizeObserver(sizePost).observe(root); } catch (e) {} }

    return {
      destroy: function () { document.removeEventListener('keydown', onKey); timers.forEach(clearTimeout); clearTimeout(progTimer); },
      answers: function () { return answers; },
      step: function () { return step; },
      next: next
    };
  };
})();

/* ===== _templates.html ===== */
(function () {
  'use strict';
  var FF = window.FF;
  function q(type, label, x) {
    var b = { id: '', type: type, label: label, help: '', props: {} };
    x = x || {};
    Object.keys(x).forEach(function (k) {
      if (k === 'opts') b.options = x.opts.map(function (o, i) { return typeof o === 'string' ? { id: 'o' + i, label: o } : { id: 'o' + i, label: o[0], value: o[1] }; });
      else b[k] = x[k];
    });
    return b;
  }
  /* Fresh ids and keys every time a template is used. */
  FF.instantiate = function (tpl) {
    var map = {}, blocks = [];
    tpl.blocks.forEach(function (src) {
      var b = JSON.parse(JSON.stringify(src));
      var id = FF.uid(); map[b.id || id] = id; b.id = id;
      if (FF.TYPES[b.type].input) { b.required = !!b.required; b.placeholder = b.placeholder || ''; b.key = b.key || FF.keyFor(b.label, blocks.filter(FF.isInput).map(function (x) { return x.key; })); }
      if (b.options) b.options.forEach(function (o) { var old = o.id; o.id = FF.uid(6); if (b.correct) b.correct = b.correct.map(function (c) { return c === old ? o.id : c; }); });
      blocks.push(b);
    });
    blocks.forEach(function (b) { if (b.logic) b.logic.rules.forEach(function (r) { r.q = map[r.q] || r.q; if (r.optIndex != null) { var tb = blocks.filter(function (x) { return x.id === r.q; })[0]; r.v = tb.options[r.optIndex].id; delete r.optIndex; } }); });
    return { title: tpl.title, blocks: blocks, settings: JSON.parse(JSON.stringify(tpl.settings || {})) };
  };

  FF.TEMPLATES = [
    { key: 'contact', title: 'Contact us', cat: 'Business', desc: 'Name, email, topic and message. The classic.',
      settings: { layout: 'classic', accent: '#0a0a0a', cover: 'none', endings: [{ id: 'end', title: 'Thanks, {name}!', text: 'We\'ll reply to {email} within one working day.' }] },
      blocks: [q('short', 'Your name', { required: true, key: 'name' }), q('email', 'Email', { required: true, key: 'email' }),
        q('dropdown', 'What is it about?', { opts: ['A question', 'A quote', 'Support', 'Press', 'Something else'] }),
        q('long', 'Your message', { required: true, key: 'message' })] },
    { key: 'rsvp', title: 'Event RSVP', cat: 'Events', desc: 'Who\'s coming, which day, dietary needs, plus-ones.',
      settings: { layout: 'classic', accent: '#1f5eff', cover: 'grid', endings: [{ id: 'end', title: 'See you there, {name}!', text: 'We saved your spot.' }] },
      blocks: [q('short', 'Full name', { required: true, key: 'name' }), q('email', 'Email', { required: true }),
        q('yesno', 'Will you come?', { required: true, id: 'come' }),
        q('number', 'How many guests are you bringing?', { props: { min: 0, max: 5 }, logic: { match: 'all', rules: [{ q: 'come', op: 'eq', v: 'yes' }] } }),
        q('multi', 'Any dietary needs?', { opts: ['Vegetarian', 'Vegan', 'Gluten-free', 'Nut allergy', 'Halal', 'Kosher'], props: { other: true }, logic: { match: 'all', rules: [{ q: 'come', op: 'eq', v: 'yes' }] } }),
        q('long', 'Anything we should know?')] },
    { key: 'nps', title: 'Customer feedback (NPS)', cat: 'Feedback', desc: 'The recommend score plus the follow-up that tells you why.',
      settings: { layout: 'focus', accent: '#ff4f1f', cover: 'band', endings: [{ id: 'end', title: 'Thank you!', text: 'Every answer is read by a real person.' }] },
      blocks: [q('scale', 'How likely are you to recommend us to a friend or colleague?', { required: true, id: 'nps', props: { min: 0, max: 10, low: 'Not likely', high: 'Very likely' } }),
        q('long', 'What\'s the main reason for your score?'),
        q('long', 'What could we do to make it a 10?', { logic: { match: 'all', rules: [{ q: 'nps', op: 'lt', v: 9 }] } }),
        q('yesno', 'May we contact you about your answers?', { id: 'contact' }),
        q('email', 'Your email', { logic: { match: 'all', rules: [{ q: 'contact', op: 'eq', v: 'yes' }] } })] },
    { key: 'job', title: 'Job application', cat: 'HR', desc: 'Contact details, CV upload, availability, salary range.',
      settings: { layout: 'classic', accent: '#11804a', cover: 'band', endings: [{ id: 'end', title: 'Application received', text: 'Thanks, {name}. We reply to every applicant within two weeks.' }] },
      blocks: [q('heading', 'About you', { props: { size: 'h2' } }), q('short', 'Full name', { required: true, key: 'name' }), q('email', 'Email', { required: true }),
        q('phone', 'Phone'), q('url', 'LinkedIn or portfolio'), q('page', 'Experience'),
        q('dropdown', 'Which role?', { required: true, opts: ['Barista', 'Shift lead', 'Baker', 'Delivery'] }),
        q('file', 'Your CV', { required: true, props: { max_files: 1 } }),
        q('long', 'Why would you like to work with us?', { required: true }),
        q('date', 'When could you start?'), q('multi', 'Which days can you work?', { opts: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }),
        q('consent', 'I agree that my application is kept for 6 months, then deleted.', { required: true })] },
    { key: 'order', title: 'Order form with total', cat: 'Business', desc: 'Pick products and quantities; the total adds itself up.',
      settings: { layout: 'classic', accent: '#b07800', cover: 'dots', endings: [{ id: 'end', title: 'Order received: ${total}', text: 'We\'ll email {email} when it\'s ready for pickup.' }] },
      blocks: [q('text', 'Fresh sourdough every Saturday. Order by Thursday 6 pm, pick up Saturday morning.'),
        q('number', 'Country loaves ($9 each)', { key: 'loaves', props: { min: 0, max: 10 } }),
        q('number', 'Baguettes ($4 each)', { key: 'baguettes', props: { min: 0, max: 20 } }),
        q('choice', 'Add a jar of jam?', { key: 'jam', opts: [['No thanks', 0], ['Strawberry ($7)', 7], ['Apricot ($7)', 7]] }),
        q('calc', 'Your total', { key: 'total', props: { formula: '{loaves} * 9 + {baguettes} * 4 + {jam}', show: true, decimals: 2, prefix: '$' } }),
        q('short', 'Name', { required: true }), q('email', 'Email', { required: true, key: 'email' })] },
    { key: 'quiz', title: 'Quick quiz with score', cat: 'Education', desc: 'Correct answers, points and a different ending by score.',
      settings: { layout: 'focus', accent: '#7a3cff', cover: 'dots', quiz: true, show_score: true,
        endings: [{ id: 'e2', title: 'Brilliant!', text: 'You got {score} right.', min_score: 3 }, { id: 'e1', title: 'Nice try', text: 'You got {score}. Have another go!' }] },
      blocks: [q('choice', 'Which planet is closest to the Sun?', { required: true, opts: ['Venus', 'Mercury', 'Mars', 'Earth'], correct: ['o1'] }),
        q('choice', 'How many sides does a hexagon have?', { required: true, opts: ['5', '6', '7', '8'], correct: ['o1'] }),
        q('short', 'What is the chemical symbol for water?', { required: true, props: { accept: ['H2O', 'H₂O'] } }),
        q('multi', 'Which of these are mammals?', { required: true, opts: ['Dolphin', 'Shark', 'Bat', 'Penguin'], correct: ['o0', 'o2'] })] },
    { key: 'signup', title: 'Workshop sign-up', cat: 'Events', desc: 'Pick a session, experience level, and agree to the rules.',
      settings: { layout: 'classic', accent: '#0f7c8c', cover: 'band', endings: [{ id: 'end', title: 'You\'re in!', text: 'We\'ll send the details for {session} to {email}.' }] },
      blocks: [q('short', 'Name', { required: true }), q('email', 'Email', { required: true, key: 'email' }),
        q('choice', 'Which session?', { required: true, key: 'session', opts: ['Saturday 10:00', 'Saturday 14:00', 'Sunday 10:00'] }),
        q('choice', 'Your experience', { opts: ['First time', 'Some', 'Lots'] }),
        q('consent', 'I\'ll cancel at least 48 hours ahead if I can\'t come.', { required: true })] },
    { key: 'bug', title: 'Bug report', cat: 'Product', desc: 'Where, what happened, how bad, screenshot.',
      settings: { layout: 'classic', accent: '#0a0a0a', font: 'mono', cover: 'none', endings: [{ id: 'end', title: 'Thanks, we\'re on it', text: '' }] },
      blocks: [q('short', 'Sum it up in a few words', { required: true }), q('long', 'What did you do, and what happened?', { required: true }),
        q('choice', 'How bad is it?', { required: true, opts: ['Annoying', 'I can work around it', 'I\'m blocked'] }),
        q('file', 'Screenshot', { props: { max_files: 3 } }), q('email', 'Email, if you\'d like an update')] },
    { key: 'volunteer', title: 'Volunteer sign-up', cat: 'Community', desc: 'Skills, availability and emergency contact.',
      settings: { layout: 'focus', accent: '#d61f69', cover: 'band', endings: [{ id: 'end', title: 'Thank you, {first_name}!', text: 'Our coordinator will call you this week.' }] },
      blocks: [q('short', 'First name', { required: true, key: 'first_name' }), q('phone', 'Phone number', { required: true }),
        q('multi', 'How would you like to help?', { required: true, opts: ['Cooking', 'Driving', 'Set-up and clean-up', 'Kids activities', 'Admin', 'Fundraising'] }),
        q('multi', 'When are you free?', { opts: ['Weekday mornings', 'Weekday evenings', 'Weekends'] }),
        q('short', 'Emergency contact (name and phone)')] },
    { key: 'booking', title: 'Appointment request', cat: 'Business', desc: 'Service, preferred date and time, notes.',
      settings: { layout: 'classic', accent: '#1f5eff', cover: 'grid', endings: [{ id: 'end', title: 'Request sent', text: 'We\'ll confirm {date} by email.' }] },
      blocks: [q('dropdown', 'Which service?', { required: true, opts: ['Consultation (30 min)', 'Full session (60 min)', 'Follow-up (20 min)'] }),
        q('date', 'Preferred date', { required: true, key: 'date' }), q('time', 'Preferred time'), q('short', 'Name', { required: true }),
        q('email', 'Email', { required: true }), q('long', 'Anything we should prepare?')] },
    { key: 'poll', title: 'Team poll', cat: 'Team', desc: 'Vote on options and rank priorities.',
      settings: { layout: 'focus', accent: '#ff4f1f', cover: 'none', endings: [{ id: 'end', title: 'Vote counted', text: '' }] },
      blocks: [q('choice', 'Where should the team lunch be?', { required: true, opts: ['Ramen place', 'Food trucks', 'Picnic in the park', 'Order in'] }),
        q('ranking', 'Rank next quarter\'s priorities', { required: true, opts: ['Faster onboarding', 'Mobile app', 'Better reports', 'Fewer meetings'] }),
        q('long', 'Anything else on your mind?')] },
    { key: 'consent', title: 'Photo consent with signature', cat: 'Education', desc: 'Parent details, permissions and a signature.',
      settings: { layout: 'classic', accent: '#11804a', font: 'serif', cover: 'band', endings: [{ id: 'end', title: 'Thank you', text: 'Your choices are saved. You can change them any time by writing to us.' }] },
      blocks: [q('short', 'Child\'s name', { required: true }), q('short', 'Parent or guardian name', { required: true }),
        q('choice', 'May we use photos of your child?', { required: true, opts: ['Yes, anywhere', 'Only inside the school', 'No photos, please'] }),
        q('signature', 'Signature', { required: true }), q('date', 'Date', { required: true })] }
  ];
  FF.template = function (key) { return FF.TEMPLATES.filter(function (x) { return x.key === key; })[0]; };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['reports', 'Reports', 'flag'], ['forms', 'Forms', 'form'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];
  var REASONS = { phishing: 'Asks for passwords or bank details', spam: 'Spam or scam', illegal: 'Illegal or harmful', impersonation: 'Pretends to be someone else', other: 'Something else' };

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.forms, 'forms (' + d.live + ' live)', 'forms') + stat(d.responses, 'answers collected', 'forms') +
          stat(d.reports_open, 'open reports', 'reports') + stat(d.suspended, 'paused forms', 'forms') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function formRow(f) {
      return '<div class="ui-item" data-form="' + esc(f.id) + '" style="display:block"><div class="meta" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:.85rem;color:var(--c-muted);margin-bottom:6px">' +
        FF.statusBadge(f.status) + (f.reports ? '<span class="ui-badge bad">' + UI.plural(f.reports, 'open report') + '</span>' : '') + (f.demo ? '<span class="ui-badge">Demo</span>' : '') +
        '<span>' + esc(f.owner) + ' · ' + esc(f.owner_email) + '</span><span>' + UI.plural(f.responses, 'answer') + '</span></div>' +
        '<h3 style="margin:0 0 8px"><a href="#f/' + esc(f.slug) + '" target="_blank" rel="noopener">' + esc(f.title) + '</a></h3><div class="ui-row">' +
        (f.status === 'suspended' ? '<button class="ui-btn sm" data-mod="restore">' + UI.icon('check') + 'Restore</button>' : '<button class="ui-btn sm danger" data-mod="suspend">' + UI.icon('lock') + 'Pause form</button>') +
        (f.reports ? '<button class="ui-btn sm" data-mod="dismiss">Dismiss reports</button>' : '') + '</div></div>';
    }
    function reports() {
      return UI.api('admin_reports', 'open').then(function (d) {
        body.innerHTML = '<p class="muted">Forms with 3 open reports are paused automatically until you look. Phishing forms: pause them, and keep the evidence (pausing keeps everything).</p>' +
          (d.reports.length ? '<div class="ad-fb">' + d.reports.map(function (r) {
            return '<div class="ui-card tight"><div class="meta"><span class="ui-badge bad">' + esc(REASONS[r.reason] || r.reason) + '</span><span>' + esc(UI.fmtDateTime(r.created)) + '</span>' + (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '') + '</div>' +
              (r.details ? '<p class="msg">' + esc(r.details) + '</p>' : '') + (r.form ? formRow(r.form) : '<p class="muted">The form was deleted.</p>') + '</div>';
          }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('flag') + '<h3>No open reports</h3><p>Reports from the “Report this form” link on every form land here.</p></div>');
      });
    }
    function forms(query) {
      return UI.api('admin_forms', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-fsearch style="margin-bottom:14px"><input type="search" name="q" placeholder="Title, slug or owner email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'form') + '</span></form><div class="ad-fb">' + d.forms.map(formRow).join('') + '</div>';
      });
    }
    var DRAW = { overview: overview, reports: reports, forms: forms, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var md = e.target.closest('[data-mod]');
      if (md) {
        var fid = md.closest('[data-form]').getAttribute('data-form'), act = md.getAttribute('data-mod');
        UI.busy(md, UI.api('admin_moderate', fid, act)).then(function () { UI.toast(act === 'suspend' ? 'Form paused' : act === 'restore' ? 'Form live again' : 'Reports closed', 'ok'); DRAW[tab](); });
        return;
      }
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
      if (e.target.matches('[data-fsearch]')) { e.preventDefault(); forms(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== edit.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['build', 'Build', 'edit'], ['design', 'Design', 'palette'], ['settings', 'Settings', 'gear'], ['share', 'Share', 'share']];

  /* ------------------------------------------------------------------ one block in the editor */
  function optRows(b, quiz) {
    var radio = b.type === 'choice' || b.type === 'dropdown', useVal = (b.options || []).some(function (o) { return o.value != null && o.value !== ''; }) || b._vals;
    return (b.options || []).map(function (o, i) {
      var correct = (b.correct || []).indexOf(o.id) >= 0;
      return '<div class="ed-opt" data-opt="' + esc(o.id) + '">' + (b.type === 'ranking' ? '<span class="mono small faint">' + (i + 1) + '</span>' : '<span class="mk' + (radio ? ' r' : '') + '"></span>') +
        '<input class="ol" data-f="opt" value="' + esc(o.label) + '" aria-label="Option ' + (i + 1) + '" maxlength="200">' +
        (useVal ? '<input type="number" class="ov" data-f="optval" step="any" value="' + esc(o.value == null ? '' : o.value) + '" aria-label="Value for calculations" placeholder="value">' : '') +
        (quiz && b.type !== 'ranking' ? '<button type="button" class="ok' + (correct ? ' on' : '') + '" data-correct title="Correct answer" aria-pressed="' + correct + '">' + UI.icon('check') + '</button>' : '') +
        '<button type="button" class="x" data-rmopt aria-label="Remove option">' + UI.icon('x') + '</button></div>';
    }).join('');
  }
  function props(b, S) {
    var p = b.props || {}, quiz = S.settings.quiz;
    var num = function (k, label, min, max) { return '<label>' + label + ' <input type="number" data-f="prop" data-k="' + k + '" value="' + esc(p[k] == null ? '' : p[k]) + '"' + (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') + '></label>'; };
    var chk = function (k, label) { return '<label><input type="checkbox" data-f="propb" data-k="' + k + '"' + (p[k] ? ' checked' : '') + '> ' + label + '</label>'; };
    var txt = function (k, label, ph, wide) { return '<label>' + label + ' <input type="text" data-f="prop" data-k="' + k + '" value="' + esc(p[k] || '') + '" placeholder="' + esc(ph || '') + '"' + (wide ? ' class="wide"' : '') + ' maxlength="120"></label>'; };
    switch (b.type) {
      case 'short': return '<div class="ed-props">' + num('maxlen', 'Max length', 1, 2000) + (quiz ? '<label>Correct answers <input type="text" class="wide" data-f="accept" value="' + esc((p.accept || []).join(', ')) + '" placeholder="poutine, Poutine"></label>' : '') + '</div>';
      case 'long': return '<div class="ed-props">' + num('maxlen', 'Max length', 1, 10000) + '</div>';
      case 'number': return '<div class="ed-props">' + num('min', 'Min') + num('max', 'Max') + txt('unit', 'Unit', 'kg, $, people') + '</div>';
      case 'rating': return '<div class="ed-props">' + num('max', 'Stars', 3, 10) + '</div>';
      case 'scale': return '<div class="ed-props"><label>From <select data-f="prop" data-k="min"><option value="0"' + (p.min === 0 ? ' selected' : '') + '>0</option><option value="1"' + (p.min === 1 ? ' selected' : '') + '>1</option></select></label>' +
        num('max', 'to', 3, 10) + txt('low', 'Low label', 'Not likely') + txt('high', 'High label', 'Very likely') + '</div>';
      case 'file': return '<div class="ed-props">' + num('max_files', 'Up to', 1, 5) + '<span>files · 10 MB each</span></div>';
      case 'multi': return '<div class="ed-props">' + num('min', 'Pick at least', 0) + num('max', 'at most', 0) + chk('other', 'Allow “Other”') + chk('shuffle', 'Shuffle') + '</div>';
      case 'choice': return '<div class="ed-props">' + chk('other', 'Allow “Other”') + chk('shuffle', 'Shuffle') + '</div>';
      case 'dropdown': case 'ranking': return '<div class="ed-props">' + chk('shuffle', 'Shuffle') + '</div>';
      case 'heading': return '<div class="ed-props"><label>Size <select data-f="prop" data-k="size"><option value="h2"' + (p.size !== 'h3' ? ' selected' : '') + '>Large</option><option value="h3"' + (p.size === 'h3' ? ' selected' : '') + '>Small</option></select></label></div>';
      case 'image': return '<div class="ed-props">' + txt('url', 'Image address', 'https://...', true) + txt('alt', 'Description for screen readers', 'A bowl of ramen', true) + '</div>';
      case 'hidden': return '<p class="small muted" style="margin:6px 0 0">Filled from the link: <code>#f/' + esc(S.slug) + '?' + esc(b.key) + '=value</code>. Respondents don\'t see it.</p>';
      case 'payment':
        var idx = S.blocks.indexOf(b), srcs = S.blocks.slice(0, idx).filter(function (x) { return x.type === 'choice' || x.type === 'dropdown'; });
        var src = srcs.filter(function (x) { return x.id === p.by; })[0];
        var linkIn = function (attrs, val, ph) { return '<input type="url" class="wide" ' + attrs + ' value="' + esc(val || '') + '" placeholder="' + (ph || 'https://buy.stripe.com/…') + '" spellcheck="false">'; };
        return '<div class="ed-props" style="display:grid;gap:10px;align-items:stretch">' +
          '<label>The price depends on <select data-f="prop" data-k="by"><option value="">nothing: one link for everyone</option>' + srcs.map(function (x) { return '<option value="' + x.id + '"' + (p.by === x.id ? ' selected' : '') + '>the answer to “' + esc((x.label || x.key).slice(0, 40)) + '”</option>'; }).join('') + '</select></label>' +
          (src ? (src.options || []).map(function (o) { return '<div class="ed-paylink"><span>' + esc(o.label) + '</span>' + linkIn('data-f="paylink" data-o="' + esc(o.id) + '"', (p.links || {})[o.id]) +
              '<input type="text" data-f="payamt" data-o="' + esc(o.id) + '" value="' + esc((p.amounts || {})[o.id] || '') + '" placeholder="$25" maxlength="40" aria-label="Amount shown"></div>'; }).join('')
            : '<label>Stripe Payment Link ' + linkIn('data-f="prop" data-k="url"', p.url) + '</label><label>Amount shown <input type="text" data-f="prop" data-k="amount" value="' + esc(p.amount || '') + '" placeholder="$25 CAD" maxlength="40"></label>') +
          '<label>Button text <input type="text" data-f="prop" data-k="button" value="' + esc(p.button || '') + '" placeholder="Pay" maxlength="40"></label>' +
          '<p class="small muted" style="margin:0">In Stripe: <b>Payment Links → New</b>, set the price, copy the link. People pay on Stripe\'s page (Fillfox never sees card details), then tick “I\'ve paid”. To have Stripe confirm each payment, add the webhook in <a href="#edit/' + esc(S.id) + '/settings">Settings → Payments</a>.</p></div>';
      case 'calc':
        var keys = S.blocks.filter(function (x) { return FF.isInput(x) && x.id !== b.id; }).map(function (x) { return x.key; });
        var e = p.formula ? FF.formulaError(p.formula, S.blocks) : '';
        return '<div class="ed-formula"><input type="text" data-f="prop" data-k="formula" value="' + esc(p.formula || '') + '" placeholder="{price} * {quantity} + 5" aria-label="Formula">' +
          '<div class="ed-chips">' + keys.concat(S.settings.quiz ? ['score'] : []).map(function (k) { return '<button type="button" data-ins="{' + esc(k) + '}">{' + esc(k) + '}</button>'; }).join('') +
          ['+', '-', '*', '/', '(', ')', 'round('].map(function (o) { return '<button type="button" data-ins="' + o + '">' + o + '</button>'; }).join('') + '</div>' +
          '<p class="small ' + (e ? '' : 'muted') + '" style="margin:0;' + (e ? 'color:var(--c-bad)' : '') + '" data-calcmsg>' + esc(e || 'Choices use their values (turn on “Values” on the options). Yes = 1, No = 0.') + '</p></div>' +
          '<div class="ed-props">' + chk('show', 'Show it on the form') + txt('prefix', 'Prefix', '$') + num('decimals', 'Decimals', 0, 6) + '</div>';
    }
    return '';
  }
  function blockHtml(b, i, S, num, flagged) {
    var T = FF.TYPES[b.type], isIn = FF.isInput(b), quiz = S.settings.quiz;
    var label;
    if (b.type === 'text' || b.type === 'consent') label = '<textarea class="lab" data-f="label" rows="1" placeholder="' + (b.type === 'text' ? 'Write some text. Use {field} to show an answer.' : 'I agree to...') + '">' + esc(b.label) + '</textarea>';
    else if (b.type === 'divider') label = '<hr class="ui-rule" style="margin:10px 0">';
    else label = '<input class="lab" data-f="label" value="' + esc(b.label) + '" placeholder="' + esc(b.type === 'page' ? 'Page title (optional)' : b.type === 'heading' ? 'Heading' : b.type === 'calc' ? 'Total' : b.type === 'image' ? 'Caption (optional)' : 'Type your question') + '" aria-label="' + esc(T.label) + ' text" maxlength="600">';
    var body = '';
    if (FF.hasOptions(b)) {
      body = '<div class="ed-mock">' + optRows(b, quiz) + '<div class="ui-row" style="gap:12px"><button type="button" class="ed-linkbtn" data-addopt>' + UI.icon('plus') + 'Add option</button>' +
        '<button type="button" class="ed-linkbtn" data-bulk>' + UI.icon('paste') + 'Paste many</button><button type="button" class="ed-linkbtn" data-lists>' + UI.icon('globe') + 'Use a list</button>' +
        (b.type !== 'ranking' ? '<button type="button" class="ed-linkbtn" data-vals>' + UI.icon('calc') + 'Values</button>' : '') + '</div></div>';
    } else if (['short', 'long', 'email', 'number', 'phone', 'url', 'date', 'time'].indexOf(b.type) >= 0) {
      body = '<div class="ed-mock"><div class="ed-fake">' + UI.icon(T.icon) + '<input data-f="placeholder" value="' + esc(b.placeholder || '') + '" placeholder="' + esc(T.label) + ' · add a placeholder" aria-label="Placeholder"></div></div>';
    } else if (b.type === 'yesno') body = '<div class="ed-mock"><div class="ui-row"><span class="ed-fake">Yes</span><span class="ed-fake">No</span></div></div>';
    else if (b.type === 'rating') { var st = ''; for (var k = 0; k < (b.props.max || 5); k++) st += '★'; body = '<div class="ed-mock"><div class="ed-fake" style="letter-spacing:4px;font-size:1.2rem">' + st + '</div></div>'; }
    else if (b.type === 'scale') body = '<div class="ed-mock"><div class="ed-fake mono">' + (b.props.min || 0) + ' · · · ' + (b.props.max || 10) + '</div></div>';
    else if (b.type === 'file') body = '<div class="ed-mock"><div class="ed-fake">' + UI.icon('upload') + 'Respondents choose or drop files here</div></div>';
    else if (b.type === 'signature') body = '<div class="ed-mock"><div class="ed-fake">' + UI.icon('pen') + 'Type their name, or draw it</div></div>';
    else if (b.type === 'payment') body = '<div class="ed-mock"><div class="ed-fake">' + UI.icon('card') + 'A “' + esc(b.props.button || 'Pay') + '” button that opens Stripe, then “I\'ve paid”</div></div>';
    var rule = b.logic && b.logic.rules && b.logic.rules.length ? '<div class="ed-rule">' + UI.icon('branch') + '<span>Shown only when ' + esc(FF.ruleText(b, S.blocks)) + '</span><button type="button" class="ed-linkbtn" data-logic>Edit</button></div>' : '';
    var tools = '<div class="ed-tools">' +
      (isIn && b.type !== 'hidden' && b.type !== 'calc' ? '<label class="req"><input type="checkbox" data-f="required"' + (b.required ? ' checked' : '') + '> Required</label>' : '') +
      '<button type="button" class="ui-btn ghost" data-logic>' + UI.icon('branch') + 'Logic</button>' +
      (isIn ? '<button type="button" class="ui-btn ghost" data-help>' + UI.icon('info') + 'Help text</button>' : '') +
      (quiz && isIn && (FF.hasOptions(b) || b.type === 'short') ? '<label class="req">Points <input type="number" data-f="points" min="0" max="100" value="' + esc(b.points == null ? 1 : b.points) + '" style="width:58px;min-height:28px;padding:2px 6px"></label>' : '') +
      '<button type="button" class="ui-btn ghost" data-bmenu aria-label="More for this block">' + UI.icon('more') + '</button>' +
      (isIn ? '<span class="key" title="Field name for links, formulas and exports">{' + esc(b.key) + '}</span>' : '') + '</div>';
    return '<div class="ed-ins"><button type="button" data-insert="' + i + '" aria-label="Insert a block here">' + UI.icon('plus') + '</button></div>' +
      '<div class="ed-b' + (flagged ? ' flagged' : '') + '" data-id="' + b.id + '" data-type="' + b.type + '"' + (b.type === 'heading' ? ' data-size="' + (b.props.size || 'h2') + '"' : '') + '>' +
      '<div class="ed-gut"><span class="n">' + (num || '') + '</span><span class="ty" title="' + esc(T.label) + '">' + UI.icon(T.icon) + '</span><button type="button" class="drag" data-drag aria-label="Drag to move" tabindex="-1">' + UI.icon('drag') + '</button></div>' +
      label + (isIn ? '<input class="help" data-f="help" value="' + esc(b.help || '') + '" placeholder="Help text (optional)" aria-label="Help text" maxlength="400">' : '') +
      body + props(b, S) + rule + tools + '</div>';
  }

  /* ------------------------------------------------------------------ the page */
  UI.page('edit', { title: 'Edit form', auth: 'user' }, function (view, ctx) {
    var id = ctx.args[0], tab = TABS.some(function (t) { return t[0] === ctx.args[1]; }) ? ctx.args[1] : 'build';
    var S = null, hist = [], fut = [], saveTimer = null, histTimer = null, saving = false, dirty = false, menu = null, prevTimer = null, prevCtl = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';

    function snap() { return JSON.stringify({ title: S.title, blocks: S.blocks, settings: S.settings }); }
    function restore(json) { var d = JSON.parse(json); S.title = d.title; S.blocks = d.blocks; S.settings = d.settings; }
    function changed(structural) {
      dirty = true;
      setSave('Editing…');
      clearTimeout(histTimer);
      if (structural) pushHist(); else histTimer = setTimeout(pushHist, 700);
      clearTimeout(saveTimer); saveTimer = setTimeout(save, 900);
      if (tab === 'build') refreshSide();
      if (tab === 'design') queuePreview();
    }
    var lastSnap = null;
    function pushHist() {
      var s = snap();
      if (s === lastSnap) return;
      if (lastSnap) { hist.push(lastSnap); if (hist.length > 80) hist.shift(); fut = []; }
      lastSnap = s;
      updUndo();
    }
    function undo() { if (!hist.length) return; fut.push(lastSnap); lastSnap = hist.pop(); restore(lastSnap); draw(); changedNoHist(); }
    function redo() { if (!fut.length) return; hist.push(lastSnap); lastSnap = fut.pop(); restore(lastSnap); draw(); changedNoHist(); }
    function changedNoHist() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); updUndo(); }
    function updUndo() {
      var u = view.querySelector('[data-undo]'), r = view.querySelector('[data-redo]');
      if (u) u.disabled = !hist.length; if (r) r.disabled = !fut.length;
    }
    function setSave(t, bad) { var el = view.querySelector('.ed-save'); if (el) { el.textContent = t; el.classList.toggle('bad', !!bad); } }
    function save() {
      if (!dirty || S.role === 'viewer') return Promise.resolve();
      if (saving) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); return Promise.resolve(); }
      saving = true; dirty = false; setSave('Saving…');
      return FF._saving = UI.apiQuiet('save_form', id, S.title, S.blocks, S.settings, S.rev).then(function (r) {
        saving = false; S.rev = r.rev;
        // keep the server's cleaned keys (ids stay the same)
        var keys = {}; r.blocks.forEach(function (b) { if (b.key) keys[b.id] = b.key; });
        S.blocks.forEach(function (b) { if (keys[b.id] && b.key !== keys[b.id]) { b.key = keys[b.id]; var k = view.querySelector('.ed-b[data-id="' + b.id + '"] .key'); if (k) k.textContent = '{' + b.key + '}'; } });
        setSave(dirty ? 'Editing…' : 'Saved');
      }, function (e) { saving = false; dirty = true; setSave('Not saved', true); UI.toast(e.message, 'error'); });
    }

    /* ---------------- frame */
    function frame() {
      var live = S.status === 'live';
      return '<div class="ed"><div class="ed-bar"><div class="ed-bar-in">' +
        '<a class="ui-btn ghost icon" href="#forms" data-go="forms" aria-label="Back to your forms">' + UI.icon('back') + '</a>' +
        '<span class="ttl" title="' + esc(S.title) + '">' + esc(S.title || 'Untitled form') + '</span>' + FF.statusBadge(S.status, S.open) +
        '<span class="ed-save">Saved</span>' +
        '<nav class="ed-tabs" aria-label="Editor">' + TABS.map(function (t) { return '<a href="#edit/' + id + '/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + '<span class="lbl">' + t[1] + '</span></a>'; }).join('') + '</nav>' +
        '<span class="ui-spacer"></span>' +
        '<button class="ui-btn ghost icon" data-undo aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">' + UI.icon('undo') + '</button>' +
        '<button class="ui-btn ghost icon" data-redo aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">' + UI.icon('redo') + '</button>' +
        '<button class="ui-btn sm" data-preview>' + UI.icon('play') + 'Preview</button>' +
        '<a class="ui-btn sm" href="#results/' + id + '" data-go="results/' + id + '">' + UI.icon('chart') + '<span class="num">' + S.responses + '</span></a>' +
        (live ? '<button class="ui-btn sm" data-share-go>' + UI.icon('link') + 'Share</button>' : '<button class="ui-btn sm accent" data-publish>' + UI.icon('arrow') + 'Publish</button>') +
        '</div></div><div data-tab-body></div></div>';
    }
    function draw() {
      var body = view.querySelector('[data-tab-body]');
      if (prevCtl) { prevCtl.destroy(); prevCtl = null; }
      ({ build: drawBuild, design: drawDesign, settings: drawSettings, share: drawShare })[tab](body);
      updUndo();
    }

    /* ---------------- build */
    function numbers() { var n = {}, i = 0; S.blocks.forEach(function (b) { if (FF.isAsked(b)) { i++; n[b.id] = (i < 10 ? '0' : '') + i; } }); return n; }
    function drawBuild(body) {
      var nums = numbers(), doc = FF.doctor(S), flagged = {};
      doc.forEach(function (d) { if (d.id && d.level !== 'tip') flagged[d.id] = 1; });
      body.innerHTML = '<div class="ed-body"><div class="ed-canvas">' +
        '<textarea class="ed-title" data-f="title" rows="1" placeholder="Form title" aria-label="Form title" maxlength="160">' + esc(S.title) + '</textarea>' +
        '<textarea class="ed-desc" data-f="description" rows="1" placeholder="Add a description (optional)" aria-label="Description">' + esc(S.settings.description || '') + '</textarea>' +
        '<div class="ed-blocks" data-blocks>' + S.blocks.map(function (b, i) { return blockHtml(b, i, S, nums[b.id], flagged[b.id]); }).join('') + '</div>' +
        '<div class="ed-new"><input type="text" data-newline placeholder="Type a question and press Enter, or / for blocks" aria-label="New question" autocomplete="off">' +
        '<div class="hint">Enter adds it · / opens blocks · --- new page · ## heading · Ctrl+Z undo</div></div></div>' +
        '<aside class="ed-side">' + sideHtml(doc) + '</aside></div>';
      body.querySelectorAll('textarea').forEach(grow);
    }
    function sideHtml(doc) {
      doc = doc || FF.doctor(S);
      var asked = S.blocks.filter(FF.isAsked), pages = S.blocks.filter(function (b) { return b.type === 'page'; }).length + 1;
      var blocking = doc.filter(function (d) { return d.level === 'block'; }).length;
      return '<div class="ed-panel"><div class="ed-stats"><div><b>' + asked.length + '</b><span>questions</span></div><div><b>~' + FF.minutes(S.blocks) + '</b><span>minutes</span></div><div><b>' + (S.settings.layout === 'focus' ? asked.length : pages) + '</b><span>steps</span></div></div></div>' +
        '<div class="ed-panel" data-doctor><h4><span>Form check</span><span>' + (blocking ? blocking + ' blocking' : doc.length ? doc.length : 'OK') + '</span></h4><ul class="ed-doc">' +
        (doc.length ? doc.map(function (d) { return '<li class="' + d.level + '"' + (d.id ? ' data-goto="' + d.id + '"' : '') + '><i></i><span>' + esc(d.text) + '</span></li>'; }).join('')
          : '<li class="allgood"><i style="background:var(--c-good)"></i><span>Looks good: labelled, readable, nothing risky.</span></li>') + '</ul></div>' +
        '<div class="ed-panel ed-keys-panel"><h4>Shortcuts</h4><div class="in ed-keys"><kbd>/</kbd> blocks · <kbd>Enter</kbd> add<br><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo<br><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate block<br><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move block<br>Write <code>{field}</code> to show an answer</div></div>';
    }
    function refreshSide() {
      var side = view.querySelector('.ed-side'); if (!side) return;
      var doc = FF.doctor(S); side.innerHTML = sideHtml(doc);
      var flagged = {}; doc.forEach(function (d) { if (d.id && d.level !== 'tip') flagged[d.id] = 1; });
      view.querySelectorAll('.ed-b').forEach(function (el) { el.classList.toggle('flagged', !!flagged[el.getAttribute('data-id')]); });
      var nums = numbers(); view.querySelectorAll('.ed-b').forEach(function (el) { var n = el.querySelector('.ed-gut .n'); if (n) n.textContent = nums[el.getAttribute('data-id')] || ''; });
      var ttl = view.querySelector('.ed-bar .ttl'); if (ttl) ttl.textContent = S.title || 'Untitled form';
    }
    function grow(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
    function blockOf(el) { var w = el.closest('.ed-b'); return w ? S.blocks.filter(function (b) { return b.id === w.getAttribute('data-id'); })[0] : null; }
    function redrawBlocks(focusId, sel) {
      var y = window.scrollY; draw(); window.scrollTo(0, y);
      if (focusId) { var el = view.querySelector('.ed-b[data-id="' + focusId + '"] ' + (sel || '.lab')); if (el) { el.focus(); if (el.select && sel !== '.lab') el.select(); } }
    }
    function insertBlock(b, at, focusSel) {
      if (at == null || at > S.blocks.length) at = S.blocks.length;
      S.blocks.splice(at, 0, b); changed(true); redrawBlocks(b.id, focusSel);
    }

    /* slash menu */
    function openMenu(anchor, filter, onPick) {
      closeMenu();
      menu = document.createElement('div'); menu.className = 'ui ed-menu'; menu.setAttribute('role', 'listbox');
      document.body.appendChild(menu);
      var r = anchor.getBoundingClientRect();
      menu.style.left = Math.min(r.left + window.scrollX, window.scrollX + innerWidth - 336) + 'px';
      menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
      menu._pick = onPick; menu._sel = 0;
      fillMenu(filter || '');
      if (r.bottom + 370 > innerHeight) menu.style.top = Math.max(window.scrollY + 8, r.top + window.scrollY - 366) + 'px';
    }
    function menuItems(f) {
      f = f.toLowerCase();
      var items = Object.keys(FF.TYPES).map(function (k) { return { type: k, label: FF.TYPES[k].label, hint: FF.TYPES[k].hint || '', icon: FF.TYPES[k].icon, group: FF.TYPES[k].group }; });
      Object.keys(FF.LISTS).forEach(function (k) { items.push({ type: 'dropdown', list: k, label: FF.LISTS[k].label, hint: 'Dropdown', icon: 'globe', group: 'Ready-made lists' }); });
      return items.filter(function (x) { return !f || x.label.toLowerCase().indexOf(f) >= 0 || x.type.indexOf(f) >= 0 || (x.hint || '').toLowerCase().indexOf(f) >= 0; });
    }
    function fillMenu(f) {
      var items = menuItems(f), html = '', g = null;
      menu._items = items; menu._sel = Math.min(menu._sel, Math.max(items.length - 1, 0));
      items.forEach(function (x, i) {
        if (x.group !== g) { g = x.group; html += '<h6>' + esc(g) + '</h6>'; }
        html += '<button type="button" role="option" data-mi="' + i + '" class="' + (i === menu._sel ? 'on' : '') + '">' + UI.icon(x.icon) + esc(x.label) + '<small>' + esc(x.hint) + '</small></button>';
      });
      menu.innerHTML = html || '<p class="small muted" style="padding:8px">No block called that. Press Enter to add it as a question.</p>';
      menu.onclick = function (e) { var b = e.target.closest('[data-mi]'); if (b) pick(+b.getAttribute('data-mi')); };
      var on = menu.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    function pick(i) {
      var x = menu && menu._items[i]; if (!x) return;
      var fn = menu._pick; closeMenu();
      var b = FF.newBlock(x.type, x.list ? '' : '', S.blocks);
      if (x.list) { b.options = FF.listOptions(x.list); b.label = { countries: 'Country', provinces: 'Province or territory', states: 'State', languages: 'Language', currencies: 'Currency', weekdays: 'Day', months: 'Month', agree: 'How much do you agree?' }[x.list]; if (x.list === 'agree') b.type = 'choice'; b.key = FF.keyFor(b.label, S.blocks.filter(FF.isInput).map(function (y) { return y.key; })); }
      fn(b);
    }
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    function menuKey(e) {
      if (!menu) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menu._sel = (menu._sel + (e.key === 'ArrowDown' ? 1 : -1) + menu._items.length) % Math.max(menu._items.length, 1); fillMenu(menu._filter || ''); return true; }
      if (e.key === 'Enter' && menu._items.length) { e.preventDefault(); pick(menu._sel); return true; }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return true; }
      return false;
    }

    /* logic editor */
    function logicModal(b) {
      var idx = S.blocks.indexOf(b), earlier = S.blocks.slice(0, idx).filter(FF.isAsked);
      var lg = JSON.parse(JSON.stringify(b.logic || { match: 'all', rules: [] }));
      if (!earlier.length) { UI.toast('Logic uses answers to earlier questions. Add a question above this one first.', 'error'); return; }
      if (!lg.rules.length) lg.rules.push({ q: earlier[earlier.length - 1].id, op: 'eq', v: '' });
      var m = UI.modal('<h2>Show this ' + (b.type === 'page' ? 'page' : 'block') + ' only when…</h2><p class="muted small">“' + esc(b.label || FF.TYPES[b.type].label) + '”' + (b.type === 'page' ? ' and everything after it, up to the next page' : '') + '</p><div data-lg></div>', { wide: true });
      var box = m.el.querySelector('[data-lg]');
      function valueField(r) {
        var q = S.blocks.filter(function (x) { return x.id === r.q; })[0];
        if (r.op === 'answered' || r.op === 'empty') return '';
        if (q && (FF.hasOptions(q))) return '<select data-r="v">' + (q.options || []).map(function (o) { return '<option value="' + esc(o.id) + '"' + (r.v === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
        if (q && q.type === 'yesno') return '<select data-r="v"><option value="yes"' + (r.v === 'yes' ? ' selected' : '') + '>Yes</option><option value="no"' + (r.v === 'no' ? ' selected' : '') + '>No</option></select>';
        var numeric = q && ['number', 'rating', 'scale', 'calc'].indexOf(q.type) >= 0;
        return '<input ' + (numeric ? 'type="number" step="any"' : 'type="text"') + ' data-r="v" value="' + esc(r.v == null ? '' : r.v) + '" placeholder="value">';
      }
      function render() {
        box.innerHTML = '<div class="ui-row" style="margin-bottom:12px"><span>Match</span><div class="ui-seg"><button type="button" data-match="all" class="' + (lg.match !== 'any' ? 'on' : '') + '">all rules</button><button type="button" data-match="any" class="' + (lg.match === 'any' ? 'on' : '') + '">any rule</button></div></div>' +
          lg.rules.map(function (r, i) {
            var q = S.blocks.filter(function (x) { return x.id === r.q; })[0];
            var ops = Object.keys(FF.OPS).filter(function (o) { return !(o === 'gt' || o === 'lt') || (q && ['number', 'rating', 'scale', 'calc'].indexOf(q.type) >= 0); });
            return '<div class="ui-row" data-ri="' + i + '" style="margin-bottom:8px;align-items:stretch"><select data-r="q" style="flex:2;min-width:160px">' + earlier.map(function (x) { return '<option value="' + x.id + '"' + (x.id === r.q ? ' selected' : '') + '>' + esc((x.label || x.key).slice(0, 60)) + '</option>'; }).join('') + '</select>' +
              '<select data-r="op" style="flex:1;min-width:120px">' + ops.map(function (o) { return '<option value="' + o + '"' + (o === r.op ? ' selected' : '') + '>' + FF.OPS[o] + '</option>'; }).join('') + '</select>' +
              '<div style="flex:1.5;min-width:140px">' + valueField(r) + '</div><button type="button" class="ui-btn ghost icon" data-rmrule aria-label="Remove rule">' + UI.icon('x') + '</button></div>';
          }).join('') +
          '<button type="button" class="ed-linkbtn" data-addrule>' + UI.icon('plus') + 'Add a rule</button>' +
          '<div class="ed-rule" style="margin-top:16px">' + UI.icon('branch') + '<span>Shown only when ' + esc(FF.ruleText({ logic: lg }, S.blocks) || '…') + '</span></div>' +
          '<div class="ui-row end" style="margin-top:18px">' + (b.logic ? '<button type="button" class="ui-btn danger" data-clear>Always show</button>' : '') + '<span class="ui-spacer"></span><button type="button" class="ui-btn ghost" data-close>Cancel</button><button type="button" class="ui-btn primary" data-savelg>Save rule</button></div>';
      }
      function read() {
        box.querySelectorAll('[data-ri]').forEach(function (row) {
          var r = lg.rules[+row.getAttribute('data-ri')];
          var q = row.querySelector('[data-r=q]').value, op = row.querySelector('[data-r=op]').value, v = row.querySelector('[data-r=v]');
          if (q !== r.q) { r.q = q; r.v = ''; } else r.v = v ? (v.type === 'number' && v.value !== '' ? +v.value : v.value) : '';
          r.op = op;
        });
      }
      box.addEventListener('change', function () { read(); render(); });
      box.addEventListener('click', function (e) {
        var mt = e.target.closest('[data-match]'); if (mt) { read(); lg.match = mt.getAttribute('data-match'); render(); return; }
        if (e.target.closest('[data-addrule]')) { read(); lg.rules.push({ q: earlier[earlier.length - 1].id, op: 'answered', v: '' }); render(); return; }
        var rm = e.target.closest('[data-rmrule]'); if (rm) { read(); lg.rules.splice(+rm.closest('[data-ri]').getAttribute('data-ri'), 1); if (!lg.rules.length) lg.rules.push({ q: earlier[0].id, op: 'answered', v: '' }); render(); return; }
        if (e.target.closest('[data-clear]')) { delete b.logic; m.close(); changed(true); redrawBlocks(); return; }
        if (e.target.closest('[data-savelg]')) {
          read();
          lg.rules.forEach(function (r) { var q = S.blocks.filter(function (x) { return x.id === r.q; })[0]; if (q && FF.hasOptions(q) && !r.v && r.op !== 'answered' && r.op !== 'empty') r.v = q.options[0] && q.options[0].id; if (q && q.type === 'yesno' && !r.v) r.v = 'yes'; });
          b.logic = lg; m.close(); changed(true); redrawBlocks();
        }
      });
      render();
    }

    function blockMenu(b, btn) {
      var i = S.blocks.indexOf(b), isIn = FF.isInput(b);
      var same = isIn ? Object.keys(FF.TYPES).filter(function (k) { return FF.TYPES[k].input; }) : ['heading', 'text', 'divider', 'image', 'page'];
      var m = UI.modal('<h2>' + esc(b.label || FF.TYPES[b.type].label) + '</h2><div class="ui-stack">' +
        '<label class="ui-field"><span>Block type</span><select data-type>' + same.map(function (k) { return '<option value="' + k + '"' + (k === b.type ? ' selected' : '') + '>' + FF.TYPES[k].label + '</option>'; }).join('') + '</select></label>' +
        (isIn ? '<label class="ui-field"><span>Field name <em>(for links, formulas, exports and webhooks)</em></span><input type="text" data-key value="' + esc(b.key) + '" maxlength="32" pattern="[a-z0-9_]+"></label>' : '') +
        '<div class="ui-row"><button class="ui-btn" data-a="up"' + (i === 0 ? ' disabled' : '') + '>' + UI.icon('up') + 'Move up</button><button class="ui-btn" data-a="down"' + (i === S.blocks.length - 1 ? ' disabled' : '') + '>' + UI.icon('down') + 'Move down</button>' +
        '<button class="ui-btn" data-a="dup">' + UI.icon('copy') + 'Duplicate</button><button class="ui-btn danger" data-a="del">' + UI.icon('trash') + 'Delete</button></div>' +
        '<div class="ui-row end"><button class="ui-btn primary" data-a="ok">Done</button></div></div>');
      m.el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-a]'); if (!a) return;
        var act = a.getAttribute('data-a');
        if (act === 'ok') {
          var t = m.el.querySelector('[data-type]').value, k = m.el.querySelector('[data-key]');
          if (k && k.value && k.value !== b.key) {
            var nk = k.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (S.blocks.some(function (x) { return x !== b && x.key === nk; })) { UI.toast('Another field already uses {' + nk + '}.', 'error'); return; }
            if (nk) b.key = nk;
          }
          if (t !== b.type) convert(b, t);
          m.close(); changed(true); redrawBlocks(b.id); return;
        }
        m.close();
        if (act === 'up' || act === 'down') move(b, act === 'up' ? -1 : 1);
        if (act === 'dup') dup(b);
        if (act === 'del') del(b);
      });
    }
    function convert(b, t) {
      var fresh = FF.newBlock(t, b.label, S.blocks);
      b.type = t; b.props = fresh.props;
      if (FF.hasOptions(fresh) && !FF.hasOptions({ type: b._old || '' })) { if (!b.options || !b.options.length) b.options = fresh.options; }
      if (!FF.hasOptions(b)) { delete b.options; delete b.correct; }
      if (FF.isInput(b) && !b.key) b.key = fresh.key;
      if (FF.isInput(b) && b.required == null) b.required = false;
    }
    function move(b, d) { var i = S.blocks.indexOf(b), j = i + d; if (j < 0 || j >= S.blocks.length) return; S.blocks.splice(j, 0, S.blocks.splice(i, 1)[0]); changed(true); redrawBlocks(b.id); }
    function dup(b) {
      var c = JSON.parse(JSON.stringify(b)); c.id = FF.uid();
      if (c.options) c.options.forEach(function (o) { var old = o.id; o.id = FF.uid(6); if (c.correct) c.correct = c.correct.map(function (x) { return x === old ? o.id : x; }); });
      if (FF.isInput(c)) c.key = FF.keyFor(c.label, S.blocks.filter(FF.isInput).map(function (x) { return x.key; }));
      insertBlock(c, S.blocks.indexOf(b) + 1);
    }
    function del(b) {
      var users = S.blocks.filter(function (x) { return x.logic && x.logic.rules.some(function (r) { return r.q === b.id; }); });
      var i = S.blocks.indexOf(b); S.blocks.splice(i, 1);
      users.forEach(function (x) { x.logic.rules = x.logic.rules.filter(function (r) { return r.q !== b.id; }); if (!x.logic.rules.length) delete x.logic; });
      changed(true); redrawBlocks();
      UI.toast('Block deleted. Ctrl+Z brings it back.');
    }
    function bulk(b) {
      var m = UI.modal('<h2>Paste options</h2><p class="muted small">One per line. They replace the current options.</p><textarea rows="10" data-bulk-t>' + esc((b.options || []).map(function (o) { return o.label; }).join('\n')) + '</textarea><div class="ui-row end" style="margin-top:12px"><button class="ui-btn primary" data-ok>Use these</button></div>');
      m.el.querySelector('[data-ok]').onclick = function () {
        var lines = m.el.querySelector('[data-bulk-t]').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 300);
        if (lines.length) { var old = {}; (b.options || []).forEach(function (o) { old[o.label] = o; }); b.options = lines.map(function (l) { return old[l] || { id: FF.uid(6), label: l }; }); }
        m.close(); changed(true); redrawBlocks();
      };
    }
    function lists(b) {
      var m = UI.modal('<h2>Use a ready-made list</h2><div class="ui-stack">' + Object.keys(FF.LISTS).map(function (k) { return '<button class="ui-btn block" data-l="' + k + '">' + esc(FF.LISTS[k].label) + ' <span class="faint small">(' + FF.LISTS[k].items.split('|').length + ')</span></button>'; }).join('') + '</div>');
      m.el.addEventListener('click', function (e) {
        var l = e.target.closest('[data-l]'); if (!l) return;
        b.options = FF.listOptions(l.getAttribute('data-l')); if (b.type === 'choice' && b.options.length > 8) b.type = 'dropdown';
        m.close(); changed(true); redrawBlocks();
      });
    }

    /* ---------------- design */
    function drawDesign(body) {
      var s = S.settings;
      var radio = function (name, val, html, on) { return '<label><input type="radio" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + '><span>' + html + '</span></label>'; };
      body.innerHTML = '<div class="ed-body" style="grid-template-columns:1fr"><div class="ed-two"><div>' +
        '<div class="ed-sec"><h3>Layout</h3><p class="muted">How people move through the form.</p><div class="ed-cards">' +
          radio('layout', 'classic', UI.icon('form') + 'Classic<em>A page of questions at a time. Page breaks split it into steps.</em>', s.layout !== 'focus') +
          radio('layout', 'focus', UI.icon('play') + 'One at a time<em>Big type, one question per screen, Enter to continue, letter keys to pick.</em>', s.layout === 'focus') + '</div></div>' +
        '<div class="ed-sec"><h3>Colour</h3><p class="muted">Buttons, numbers and highlights. Text on buttons switches to black or white automatically.</p><div class="ed-sw">' +
          FF.ACCENTS.map(function (c) { return '<button type="button" data-accent="' + c + '" class="' + (s.accent === c ? 'on' : '') + '" style="background:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join('') +
          '<input type="color" data-f="accent" value="' + esc(s.accent || '#0a0a0a') + '" aria-label="Custom colour"></div></div>' +
        '<div class="ed-sec"><h3>Font</h3><div class="ed-cards">' + Object.keys(FF.FONTS).map(function (k) {
          return radio('font', k, '<span class="aa" style="font-family:' + FF.FONTS[k][1].replace(/"/g, '&quot;') + '">Aa</span>' + FF.FONTS[k][0], (s.font || 'plex') === k);
        }).join('') + '</div></div>' +
        '<div class="ed-sec"><h3>Cover</h3><div class="ed-cards">' + [['band', 'Colour band'], ['grid', 'Grid'], ['dots', 'Dots'], ['none', 'None']].map(function (c) { return radio('cover', c[0], c[1], (s.cover || 'band') === c[0]); }).join('') + '</div></div>' +
        '<div class="ed-sec"><h3>Details</h3>' +
          '<div class="ed-field"><span>Alignment</span><div class="ui-seg"><button type="button" data-align="left" class="' + (s.align !== 'center' ? 'on' : '') + '">Left</button><button type="button" data-align="center" class="' + (s.align === 'center' ? 'on' : '') + '">Centre</button></div></div>' +
          '<label class="ed-field"><span>Language of buttons and messages</span><select data-f="lang">' + Object.keys(FF.LANGS).map(function (k) { return '<option value="' + k + '"' + (s.lang === k ? ' selected' : '') + '>' + FF.LANGS[k] + '</option>'; }).join('') + '</select></label>' +
          '<label class="ed-field"><span>Submit button text <em>(optional)</em></span><input type="text" data-f="button" value="' + esc(s.button || '') + '" placeholder="Submit" maxlength="40"></label>' +
          '<label class="ed-toggle"><input type="checkbox" data-f="progress"' + (s.progress !== false ? ' checked' : '') + '><div><b>Progress bar</b><span>A thin bar at the top shows how far along people are.</span></div></label></div>' +
        '</div><div><div class="ed-prev-h"><span>Live preview</span><span data-prevnote></span></div><div class="ed-prev" data-prev></div></div></div></div>';
      queuePreview(true);
    }
    function queuePreview(now) {
      clearTimeout(prevTimer);
      prevTimer = setTimeout(function () {
        var host = view.querySelector('[data-prev]'); if (!host) return;
        if (prevCtl) prevCtl.destroy();
        prevCtl = FF.render(host, { slug: 'preview-' + id, title: S.title, blocks: S.blocks, settings: S.settings }, { mode: 'template' });
      }, now ? 0 : 250);
    }

    /* ---------------- settings */
    function drawSettings(body) {
      var s = S.settings, quiz = s.quiz;
      var tog = function (k, title, text) { return '<label class="ed-toggle"><input type="checkbox" data-f="' + k + '"' + (s[k] ? ' checked' : '') + '><div><b>' + title + '</b><span>' + text + '</span></div></label>'; };
      body.innerHTML = '<div class="ed-body" style="grid-template-columns:1fr"><div class="ed-two"><div>' +
        '<div class="ed-sec"><h3>Endings</h3><p class="muted">What people see after sending. Write <code>{field}</code> to show an answer' + (quiz ? ', <code>{score}</code> for the score' : '') + '.' + (quiz ? ' With a quiz, each ending can need a minimum score.' : '') + '</p><div data-ends>' +
          (s.endings || []).map(function (e, i) {
            return '<div class="ed-end" data-ei="' + i + '"><div class="row"><span class="ui-badge">' + (i === 0 && !quiz ? 'Thank-you page' : 'Ending ' + (i + 1)) + '</span>' + (quiz ? '<label class="small">Score at least <input type="number" data-e="min_score" value="' + esc(e.min_score == null ? '' : e.min_score) + '" style="width:70px;min-height:32px;padding:4px 8px" placeholder="any"></label>' : '') +
              '<span class="ui-spacer"></span>' + ((s.endings || []).length > 1 ? '<button type="button" class="ui-btn ghost sm" data-rmend>' + UI.icon('trash') + '</button>' : '') + '</div>' +
              '<input type="text" data-e="title" value="' + esc(e.title) + '" placeholder="Thank you!" maxlength="160" aria-label="Ending title">' +
              '<textarea data-e="text" rows="2" placeholder="Your answers were sent." aria-label="Ending text">' + esc(e.text || '') + '</textarea>' +
              '<input type="url" data-e="redirect" value="' + esc(e.redirect || '') + '" placeholder="Then go to https://... (optional)" aria-label="Redirect address"></div>';
          }).join('') + '</div>' + (quiz ? '<button type="button" class="ui-btn sm" data-addend>' + UI.icon('plus') + 'Add an ending</button>' : '') + '</div>' +
        '<div class="ed-sec"><h3>Quiz</h3>' + tog('quiz', 'Quiz mode', 'Mark correct answers on choices (the ✓ next to options) and accepted answers on short questions. Answers are scored on the server, so nobody can peek.') +
          (quiz ? tog('show_score', 'Show the score at the end', 'People see “4 / 5” on their ending.') : '') + '</div>' +
        '</div><div>' +
        '<div class="ed-sec"><h3>When it takes answers</h3>' +
          '<label class="ed-field"><span>Close after this date <em>(optional)</em></span><input type="date" data-f="close_at" value="' + esc(s.close_at || '') + '"></label>' +
          '<label class="ed-field"><span>Stop after this many answers <em>(optional)</em></span><input type="number" data-f="limit" min="1" value="' + esc(s.limit || '') + '" placeholder="No limit"></label>' +
          '<label class="ed-field"><span>Message when closed</span><input type="text" data-f="closed_message" value="' + esc(s.closed_message || '') + '" maxlength="400"></label>' +
          tog('one_per_device', 'One answer per device', 'After sending, the same browser sees “You already answered”. Light protection, not a guarantee.') + '</div>' +
        '<div class="ed-sec"><h3>Data and privacy</h3>' +
          tog('save_partial', 'Keep unfinished answers', 'See what people typed before they left. Off by default: turn it on only if you need it, and say so in your description.') +
          '<label class="ed-field"><span>Delete answers automatically after</span><select data-f="retention_days">' + [['', 'Never'], [30, '30 days'], [90, '90 days'], [180, '6 months'], [365, '1 year'], [730, '2 years']].map(function (o) {
            return '<option value="' + o[0] + '"' + (String(s.retention_days || '') === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
          '<label class="ed-field"><span>Privacy contact <em>(shown at the bottom of the form; Quebec Law 25 / GDPR)</em></span><input type="text" data-f="privacy_contact" value="' + esc(s.privacy_contact || '') + '" placeholder="Jane Doe, privacy@yourdomain.com" maxlength="300"></label></div>' +
        (S.blocks.some(function (b) { return b.type === 'payment'; }) ? '<div class="ed-sec"><h3>Payments</h3><p class="muted">Optional: let Stripe confirm each payment, so results show “Paid, checked by Stripe” with the amount.</p>' +
          '<ol class="small" style="padding-left:18px;margin:0 0 12px"><li>In Stripe: <b>Developers → Webhooks → Add endpoint</b>.</li><li>Endpoint URL: <code style="word-break:break-all">' + esc(location.origin + '/_/api/stripe?form=' + S.slug) + '</code></li>' +
          '<li>Event: <b>checkout.session.completed</b> (add <b>async_payment_succeeded</b> for bank payments).</li><li>Copy the <b>signing secret</b> (whsec_…) here.</li></ol>' +
          '<label class="ed-field"><span>Signing secret</span><input type="password" data-f="stripe_secret" value="' + esc(s.stripe_secret || '') + '" placeholder="whsec_…" autocomplete="off" spellcheck="false"></label></div>' : '') +
        '<div class="ed-sec"><h3>Emails</h3>' + tog('notify', 'Email me each new answer', 'Sent to ' + esc(ctx.me.email) + '.') +
          tog('copy_to_respondent', 'Send people a copy of their answers', 'Uses the first email question in the form.') + '</div>' +
        '</div></div></div>';
      body.querySelectorAll('[data-e=text]').forEach(grow);
    }

    /* ---------------- share */
    function drawShare(body) {
      var s = S.settings, live = S.status === 'live', url = FF.formUrl(S.slug), owner = S.role === 'owner';
      var embed = '<iframe src="' + FF.formUrl(S.slug, 'embed=1') + '" data-fillfox="' + S.slug + '" style="width:100%;height:640px;border:0" title="' + (S.title || 'Form').replace(/"/g, '&quot;') + '"></iframe>\n' +
        '<scr' + 'ipt>addEventListener("message",function(e){var d=e.data;if(d&&d.fillfox==="height"){var f=document.querySelector(\'iframe[data-fillfox="\'+d.slug+\'"]\');if(f)f.style.height=d.height+"px"}});</scr' + 'ipt>';
      var prefill = S.blocks.filter(function (b) { return FF.isInput(b) && ['file', 'signature', 'calc', 'ranking'].indexOf(b.type) < 0; });
      body.innerHTML = '<div class="ed-body" style="grid-template-columns:1fr"><div class="ed-two"><div>' +
        '<div class="ed-sec"><h3>' + (live ? 'Your form is live' : S.status === 'suspended' ? 'Paused after reports' : 'Not published yet') + '</h3>' +
          (live ? '<p class="muted">Anyone with the link can answer. ' + (S.open ? '' : '<b>It isn\'t taking answers right now</b> (closing date or answer limit).') + '</p>' +
            '<div class="ed-link"><input type="text" readonly value="' + esc(url) + '" aria-label="Form link"><button class="ui-btn" data-copy="' + esc(url) + '">' + UI.icon('copy') + 'Copy</button><a class="ui-btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + UI.icon('external') + '</a></div>' +
            '<div class="ed-qr" style="margin-top:14px"><div data-qr></div><div class="ui-stack" style="margin:0"><button class="ui-btn sm" data-qrdl>' + UI.icon('download') + 'Download QR code</button>' +
            '<button class="ui-btn sm" data-status="closed">' + UI.icon('lock') + 'Stop taking answers</button><button class="ui-btn sm ghost" data-status="draft">Unpublish</button></div></div>'
            : S.status === 'suspended' ? '<p class="muted">People reported this form, so it was paused. An admin will look at it.</p>'
            : '<p class="muted">Publishing makes the link work. You can keep editing after: changes go live as you save.</p><button class="ui-btn accent lg" data-publish>' + UI.icon('arrow') + (S.status === 'closed' ? 'Open it again' : 'Publish') + '</button>') + '</div>' +
        '<div class="ed-sec"><h3>Embed on your website</h3><p class="muted">Paste this where the form should appear. It resizes itself to fit.</p><textarea class="ed-code" readonly data-embed>' + esc(embed) + '</textarea>' +
          '<div class="ui-row" style="margin-top:8px"><button class="ui-btn sm" data-copy-el="[data-embed]">' + UI.icon('code') + 'Copy embed code</button></div></div>' +
        '<div class="ed-sec"><h3>Pre-filled link</h3><p class="muted">Fill in answers for people (or hidden fields like <code>source</code>), then share this link.</p><div data-pf>' +
          prefill.slice(0, 12).map(function (b) { return '<label class="ed-field"><span>' + esc(b.label || b.key) + ' <em>{' + esc(b.key) + '}</em></span><input type="text" data-pf-key="' + esc(b.key) + '" placeholder="' + (FF.hasOptions(b) ? 'an option\'s text' : b.type === 'yesno' ? 'yes or no' : '') + '"></label>'; }).join('') +
          '</div><div class="ed-link"><input type="text" readonly data-pfurl value="' + esc(url) + '" aria-label="Pre-filled link"><button class="ui-btn" data-copy-el="[data-pfurl]">' + UI.icon('copy') + 'Copy</button></div></div>' +
        '</div><div>' +
        '<div class="ed-sec"><h3>Webhook</h3><p class="muted">Each new answer is POSTed as JSON to your address (Zapier, Make, n8n, your own server). Signed with <code>X-Fillfox-Signature: sha256=…</code> when you set a secret.</p>' +
          '<label class="ed-field"><span>Address</span><input type="url" data-f="webhook" value="' + esc(s.webhook || '') + '" placeholder="https://hooks.example.com/..."></label>' +
          '<label class="ed-field"><span>Secret <em>(optional)</em></span><input type="text" data-f="webhook_secret" value="' + esc(s.webhook_secret || '') + '" maxlength="80"></label>' +
          '<button class="ui-btn sm" data-hooktest>' + UI.icon('webhook') + 'Send a test</button><div class="ed-log" data-log>' + logHtml(S.webhook_log) + '</div></div>' +
        '<div class="ed-sec"><h3>Team</h3>' + (owner ? '<p class="muted">Teammates can edit, publish and see answers. They need a Fillfox account with this email.</p><ul class="ed-team">' +
          (S.collaborators || []).map(function (e) { return '<li>' + UI.icon('user') + '<span style="flex:1">' + esc(e) + '</span><button class="ui-btn ghost sm" data-rmteam="' + esc(e) + '">Remove</button></li>'; }).join('') +
          '</ul><form class="ed-link" data-team><input type="email" name="email" placeholder="teammate@example.com" required aria-label="Teammate email"><button class="ui-btn" type="submit">' + UI.icon('plus') + 'Add</button></form>'
          : '<p class="muted">Shared with you by ' + esc(S.owner) + '. Only they can change the team.</p>') + '</div>' +
        '<div class="ed-sec"><h3>Export</h3><p class="muted">Download the form itself (questions, logic, design) to keep or import elsewhere.</p><button class="ui-btn sm" data-json>' + UI.icon('download') + 'Export as JSON</button></div>' +
        '</div></div></div>';
      if (live) drawQr(url);
    }
    function logHtml(log) {
      return (log || []).slice().reverse().slice(0, 6).map(function (l) { return '<div class="' + (l.ok ? 'okk' : 'bad') + '">' + (l.ok ? '✓ ' : '✗ ') + esc(UI.fmtDateTime(l.at)) + ' · ' + esc(l.event) + ' · ' + (l.status || l.error || '') + '</div>'; }).join('');
    }
    function drawQr(url) {
      var go = function () {
        var box = view.querySelector('[data-qr]'); if (!box || !window.qrcode) return;
        var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
        box.innerHTML = qr.createImgTag(4, 0, 'QR code for the form link');
      };
      if (window.qrcode) return go();
      var sc = document.createElement('script'); sc.src = '_/theme/qrcode.min.js'; sc.onload = go; document.head.appendChild(sc);
    }

    /* ---------------- preview overlay */
    function preview() {
      save();
      var ov = document.createElement('div'); ov.className = 'ui ed-overlay';
      ov.innerHTML = '<div class="ed-overlay-bar"><span>PREVIEW · ' + esc(S.settings.layout === 'focus' ? 'one at a time' : 'classic') + ' · answers aren\'t saved</span><button class="ui-btn sm" data-x>' + UI.icon('x') + 'Close</button></div><div data-h></div>';
      document.body.appendChild(ov); document.documentElement.classList.add('ui-modal-open');
      var c = FF.render(ov.querySelector('[data-h]'), { slug: 'preview-' + id, title: S.title, blocks: S.blocks, settings: S.settings }, { mode: 'template' });
      function close() { c.destroy(); ov.remove(); document.documentElement.classList.remove('ui-modal-open'); document.removeEventListener('keydown', esck); }
      function esck(e) { if (e.key === 'Escape') close(); }
      ov.querySelector('[data-x]').onclick = close; document.addEventListener('keydown', esck);
    }
    function publish(btn, status) {
      status = status || 'live';
      return save().then(function () {
        if (status === 'live') {
          var blocking = FF.doctor(S).filter(function (d) { return d.level === 'block'; });
          if (blocking.length) { UI.toast(blocking[0].text, 'error'); tab = 'build'; location.hash = '#edit/' + id; return; }
        }
        return UI.busy(btn, UI.api('set_status', id, status)).then(function (r) {
          S.status = r.status; S.open = r.open;
          if (status === 'live') { UI.toast('Published. Your link is ready.', 'ok'); confetti(); }
          else UI.toast(status === 'closed' ? 'It stopped taking answers.' : 'Unpublished.');
          if (tab !== 'share') location.hash = '#edit/' + id + '/share'; else { view.innerHTML = frame(); draw(); }
        });
      });
    }
    function confetti() {
      var host = document.createElement('div'); host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999;overflow:hidden';
      var cols = ['#ff4f1f', '#0a0a0a', S.settings.accent || '#1f5eff', '#f2b01e'];
      for (var i = 0; i < 46; i++) {
        var p = document.createElement('i'), x = Math.random() * 100, d = 900 + Math.random() * 900;
        p.style.cssText = 'position:absolute;top:-12px;left:' + x + '%;width:' + (6 + Math.random() * 6) + 'px;height:' + (8 + Math.random() * 8) + 'px;background:' + cols[i % cols.length] + ';transform:rotate(' + (Math.random() * 360) + 'deg)';
        p.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(' + (innerHeight + 40) + 'px) rotate(' + (Math.random() * 720) + 'deg)' }], { duration: d, easing: 'cubic-bezier(.2,.7,.4,1)', delay: Math.random() * 300 });
        host.appendChild(p);
      }
      document.body.appendChild(host); setTimeout(function () { host.remove(); }, 2200);
    }

    /* ---------------- events */
    function onInput(e) {
      var el = e.target, f = el.getAttribute('data-f');
      if (el.hasAttribute('data-newline')) {
        var v = el.value;
        if (v.indexOf('/') === 0) {
          if (!menu) openMenu(el, '', function (b) { el.value = ''; insertBlock(b, null); });
          menu._filter = v.slice(1); fillMenu(menu._filter);
        } else closeMenu();
        return;
      }
      if (el.hasAttribute('data-e')) {
        var ei = +el.closest('[data-ei]').getAttribute('data-ei'), k = el.getAttribute('data-e'), en = S.settings.endings[ei];
        en[k] = k === 'min_score' ? (el.value === '' ? null : +el.value) : el.value;
        if (el.tagName === 'TEXTAREA') grow(el);
        changed(); return;
      }
      if (el.hasAttribute('data-pf-key')) {
        var parts = [];
        view.querySelectorAll('[data-pf-key]').forEach(function (x) { if (x.value.trim()) parts.push(encodeURIComponent(x.getAttribute('data-pf-key')) + '=' + encodeURIComponent(x.value.trim())); });
        view.querySelector('[data-pfurl]').value = FF.formUrl(S.slug, parts.join('&'));
        return;
      }
      if (!f && el.type === 'radio' && ['layout', 'font', 'cover'].indexOf(el.name) >= 0) { if (el.checked) { S.settings[el.name] = el.value; changed(true); } return; }
      if (!f) return;
      if (f === 'title') { if (/\n/.test(el.value)) el.value = el.value.replace(/\n/g, ' '); S.title = el.value; grow(el); changed(); return; }
      if (f === 'description') { S.settings.description = el.value; grow(el); changed(); return; }
      if (['lang', 'button', 'close_at', 'limit', 'closed_message', 'retention_days', 'privacy_contact', 'webhook', 'webhook_secret', 'accent', 'stripe_secret'].indexOf(f) >= 0) {
        S.settings[f] = (f === 'limit' || f === 'retention_days') ? (el.value ? +el.value : null) : el.value;
        if (f === 'accent') view.querySelectorAll('[data-accent]').forEach(function (b) { b.classList.remove('on'); });
        changed(); return;
      }
      if (['progress', 'quiz', 'show_score', 'one_per_device', 'save_partial', 'notify', 'copy_to_respondent'].indexOf(f) >= 0) {
        S.settings[f] = el.checked; changed(true);
        if (f === 'quiz') drawSettings(view.querySelector('[data-tab-body]'));
        return;
      }
      var b = blockOf(el); if (!b) return;
      if (f === 'label') { b.label = el.value; if (el.tagName === 'TEXTAREA') grow(el); }
      else if (f === 'help') b.help = el.value;
      else if (f === 'placeholder') b.placeholder = el.value;
      else if (f === 'required') { b.required = el.checked; changed(true); return; }
      else if (f === 'points') b.points = el.value === '' ? 1 : +el.value;
      else if (f === 'accept') b.props.accept = el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      else if (f === 'paylink') { b.props.links = b.props.links || {}; b.props.links[el.getAttribute('data-o')] = el.value.trim(); }
      else if (f === 'payamt') { b.props.amounts = b.props.amounts || {}; b.props.amounts[el.getAttribute('data-o')] = el.value; }
      else if (f === 'opt' || f === 'optval') {
        var o = b.options.filter(function (x) { return x.id === el.closest('[data-opt]').getAttribute('data-opt'); })[0];
        if (f === 'opt') o.label = el.value; else { if (el.value === '') delete o.value; else o.value = +el.value; }
      } else if (f === 'prop' || f === 'propb') {
        var key = el.getAttribute('data-k');
        if (f === 'propb') b.props[key] = el.checked;
        else if (el.type === 'number' || (el.tagName === 'SELECT' && key === 'min')) b.props[key] = el.value === '' ? null : +el.value;
        else b.props[key] = el.value;
        if (b.type === 'calc' && key === 'formula') { var msg = el.closest('.ed-b').querySelector('[data-calcmsg]'), er = FF.formulaError(el.value, S.blocks); if (msg) { msg.textContent = er || 'Looks right.'; msg.style.color = er ? 'var(--c-bad)' : 'var(--c-good)'; } }
        if (b.type === 'heading' && key === 'size') el.closest('.ed-b').setAttribute('data-size', el.value);
        if (b.type === 'payment' && key === 'by') { if (e.type === 'change') { changed(true); redrawBlocks(b.id, '[data-k=by]'); } return; }
        if (e.type === 'change' && (el.type === 'checkbox' || el.tagName === 'SELECT' || key === 'max')) { changed(true); if (key === 'max' && b.type === 'rating') redrawBlocks(); return; }
      }
      changed();
    }
    function onKey(e) {
      var el = e.target;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        if (el.matches && el.matches('input, textarea') && !e.shiftKey && e.key === 'z' && hist.length === 0) return;
        e.preventDefault(); clearTimeout(histTimer); pushHist();
        if (e.shiftKey || e.key === 'y') redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); clearTimeout(saveTimer); dirty = true; save(); return; }
      if (!view.contains(el)) return;
      if (menuKey(e)) return;
      var b = el.closest && blockOf(el);
      if (b && (e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); dup(b); return; }
      if (b && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(b, e.key === 'ArrowUp' ? -1 : 1); return; }
      if (el.hasAttribute('data-newline') && e.key === 'Enter') {
        e.preventDefault();
        var v = el.value.trim(); if (!v) return;
        var nb = FF.guess(v, S.blocks); el.value = '';
        if (nb) { insertBlock(nb, null, FF.hasOptions(nb) ? '.ed-opt:last-child input.ol' : null); var n2 = view.querySelector('[data-newline]'); if (n2 && !FF.hasOptions(nb)) n2.focus(); }
        return;
      }
      if (el.getAttribute('data-f') === 'opt' && e.key === 'Enter') {
        e.preventDefault();
        var ob = blockOf(el), oid = el.closest('[data-opt]').getAttribute('data-opt'), oi = ob.options.map(function (x) { return x.id; }).indexOf(oid);
        var no = { id: FF.uid(6), label: '' }; ob.options.splice(oi + 1, 0, no); changed(true); redrawBlocks(ob.id, '[data-opt="' + no.id + '"] input.ol');
        return;
      }
      if (el.getAttribute('data-f') === 'opt' && e.key === 'Backspace' && !el.value) {
        var bb = blockOf(el); if (bb.options.length <= 1) return;
        e.preventDefault();
        var id2 = el.closest('[data-opt]').getAttribute('data-opt'), ix = bb.options.map(function (x) { return x.id; }).indexOf(id2);
        bb.options.splice(ix, 1); changed(true); var prevO = bb.options[Math.max(0, ix - 1)];
        redrawBlocks(bb.id, '[data-opt="' + prevO.id + '"] input.ol');
        return;
      }
      if (el.getAttribute('data-f') === 'label' && e.key === 'Enter' && el.tagName === 'INPUT') {
        e.preventDefault(); var nl = view.querySelector('[data-newline]');
        var lb = blockOf(el); if (FF.hasOptions(lb)) { var first = el.closest('.ed-b').querySelector('input.ol'); if (first) { first.focus(); return; } }
        if (nl) nl.focus();
      }
    }
    function onClick(e) {
      var t = e.target;
      if (menu && !t.closest('.ed-menu') && !t.closest('[data-newline]')) closeMenu();
      if (t.closest('[data-undo]')) { clearTimeout(histTimer); pushHist(); undo(); return; }
      if (t.closest('[data-redo]')) { redo(); return; }
      if (t.closest('[data-preview]')) { preview(); return; }
      var pb = t.closest('[data-publish]'); if (pb) { publish(pb, 'live'); return; }
      if (t.closest('[data-share-go]')) { location.hash = '#edit/' + id + '/share'; return; }
      var stb = t.closest('[data-status]'); if (stb) { publish(stb, stb.getAttribute('data-status')); return; }
      var cp = t.closest('[data-copy]'); if (cp) { FF.copy(cp.getAttribute('data-copy'), 'Link copied'); return; }
      var ce = t.closest('[data-copy-el]'); if (ce) { FF.copy(view.querySelector(ce.getAttribute('data-copy-el')).value, 'Copied'); return; }
      if (t.closest('[data-qrdl]')) { var img = view.querySelector('[data-qr] img'); if (img) { var a = document.createElement('a'); a.href = img.src; a.download = 'fillfox-' + S.slug + '-qr.gif'; a.click(); } return; }
      if (t.closest('[data-json]')) { FF.download((S.title || 'form').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.fillfox.json', JSON.stringify({ fillfox: 1, title: S.title, blocks: S.blocks, settings: Object.assign({}, S.settings, { webhook: '', webhook_secret: '' }) }, null, 2), 'application/json'); return; }
      var ht = t.closest('[data-hooktest]');
      if (ht) { save().then(function () { return UI.busy(ht, UI.api('test_webhook', id)); }).then(function (r) { if (!r) return; S.webhook_log = r.log; view.querySelector('[data-log]').innerHTML = logHtml(r.log); UI.toast(r.result && r.result.ok ? 'Delivered' : 'It didn\'t arrive. See the log.', r.result && r.result.ok ? 'ok' : 'error'); }); return; }
      var rt = t.closest('[data-rmteam]');
      if (rt) { var em = rt.getAttribute('data-rmteam'); UI.api('set_collaborators', id, S.collaborators.filter(function (x) { return x !== em; })).then(function (r) { S.collaborators = r.collaborators; drawShare(view.querySelector('[data-tab-body]')); }); return; }
      var ac = t.closest('[data-accent]'); if (ac) { S.settings.accent = ac.getAttribute('data-accent'); view.querySelectorAll('[data-accent]').forEach(function (x) { x.classList.toggle('on', x === ac); }); var ci = view.querySelector('input[type=color]'); if (ci) ci.value = S.settings.accent; changed(true); return; }
      var al = t.closest('[data-align]'); if (al) { S.settings.align = al.getAttribute('data-align'); view.querySelectorAll('[data-align]').forEach(function (x) { x.classList.toggle('on', x === al); }); changed(true); return; }
      if (t.closest('[data-addend]')) { S.settings.endings.push({ id: FF.uid(6), title: 'Thank you!', text: '', min_score: null, redirect: '' }); changed(true); drawSettings(view.querySelector('[data-tab-body]')); return; }
      var re = t.closest('[data-rmend]'); if (re) { S.settings.endings.splice(+re.closest('[data-ei]').getAttribute('data-ei'), 1); changed(true); drawSettings(view.querySelector('[data-tab-body]')); return; }
      var go = t.closest('[data-goto]'); if (go) { var be = view.querySelector('.ed-b[data-id="' + go.getAttribute('data-goto') + '"]'); if (be) { be.scrollIntoView({ block: 'center', behavior: 'smooth' }); var l = be.querySelector('.lab, input'); if (l) setTimeout(function () { l.focus({ preventScroll: true }); }, 300); } return; }
      var ins = t.closest('[data-insert]'); if (ins) { var at = +ins.getAttribute('data-insert'); openMenu(ins, '', function (nb) { insertBlock(nb, at); }); return; }
      var b = blockOf(t); if (!b) return;
      if (t.closest('[data-logic]')) { logicModal(b); return; }
      if (t.closest('[data-help]')) { var h = t.closest('.ed-b').querySelector('input.help'); h.style.display = 'block'; h.focus(); return; }
      if (t.closest('[data-bmenu]')) { blockMenu(b, t); return; }
      if (t.closest('[data-addopt]')) { var no = { id: FF.uid(6), label: 'Option ' + ((b.options || []).length + 1) }; b.options.push(no); changed(true); redrawBlocks(b.id, '[data-opt="' + no.id + '"] input.ol'); return; }
      if (t.closest('[data-rmopt]')) { var oid = t.closest('[data-opt]').getAttribute('data-opt'); b.options = b.options.filter(function (o) { return o.id !== oid; }); if (b.correct) b.correct = b.correct.filter(function (x) { return x !== oid; }); changed(true); redrawBlocks(); return; }
      if (t.closest('[data-correct]')) {
        var cid = t.closest('[data-opt]').getAttribute('data-opt'); b.correct = b.correct || [];
        if (b.type === 'multi') { var k = b.correct.indexOf(cid); if (k >= 0) b.correct.splice(k, 1); else b.correct.push(cid); }
        else b.correct = b.correct[0] === cid ? [] : [cid];
        changed(true); redrawBlocks(); return;
      }
      if (t.closest('[data-bulk]')) { bulk(b); return; }
      if (t.closest('[data-lists]')) { lists(b); return; }
      if (t.closest('[data-vals]')) { b._vals = true; if (!b.options.some(function (o) { return o.value != null; })) b.options.forEach(function (o, i) { o.value = i; }); changed(true); redrawBlocks(); return; }
      var ch = t.closest('[data-ins]'); if (ch) { var fi = t.closest('.ed-b').querySelector('[data-k=formula]'); var pos = fi.selectionStart == null ? fi.value.length : fi.selectionStart; fi.value = fi.value.slice(0, pos) + ch.getAttribute('data-ins') + fi.value.slice(fi.selectionEnd || pos); fi.focus(); fi.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    function onSubmit(e) {
      if (e.target.matches('[data-team]')) {
        e.preventDefault();
        var em = e.target.email.value.trim().toLowerCase();
        UI.api('set_collaborators', id, (S.collaborators || []).concat([em])).then(function (r) { S.collaborators = r.collaborators; UI.toast('Added. They\'ll see it under “Shared with you”.', 'ok'); drawShare(view.querySelector('[data-tab-body]')); });
      }
    }
    // drag and drop (desktop); the block menu has Move up / Move down for everyone
    var dragId = null;
    function onDrag(e) {
      var w = e.target.closest && e.target.closest('.ed-b');
      if (e.type === 'mousedown') { if (e.target.closest('[data-drag]') && w) w.setAttribute('draggable', 'true'); return; }
      if (e.type === 'dragstart' && w) { dragId = w.getAttribute('data-id'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} return; }
      if (!dragId) return;
      view.querySelectorAll('.drop-before, .drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
      if (e.type === 'dragover' && w) { e.preventDefault(); var r = w.getBoundingClientRect(); w.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); return; }
      if (e.type === 'drop' && w) {
        e.preventDefault();
        var target = w.getAttribute('data-id'), before = e.clientY < w.getBoundingClientRect().top + w.getBoundingClientRect().height / 2;
        if (target !== dragId) {
          var from = S.blocks.map(function (x) { return x.id; }).indexOf(dragId), blk = S.blocks.splice(from, 1)[0];
          var to = S.blocks.map(function (x) { return x.id; }).indexOf(target) + (before ? 0 : 1);
          S.blocks.splice(to, 0, blk); changed(true); redrawBlocks(dragId);
        }
      }
      if (e.type === 'dragend' || e.type === 'drop') { dragId = null; view.querySelectorAll('[draggable=true]').forEach(function (x) { x.setAttribute('draggable', 'false'); }); }
    }

    view.addEventListener('input', onInput);
    view.addEventListener('change', onInput);
    view.addEventListener('click', onClick);
    view.addEventListener('submit', onSubmit);
    ['mousedown', 'dragstart', 'dragover', 'drop', 'dragend'].forEach(function (k) { view.addEventListener(k, onDrag); });
    document.addEventListener('keydown', onKey);
    function beforeUnload(e) { if (dirty || saving) { save(); e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);

    // switching tabs remounts the page: wait for the last save so we never load older content
    var ready = Promise.resolve(FF._saving).catch(function () {}).then(function () { return UI.api('get_form_edit', id); }).then(function (d) {
      if (d.role === 'viewer') { UI.toast('Examples are read-only. Use a copy to edit it.'); UI.go('results', id); return; }
      S = d; S.settings.endings = S.settings.endings || [];
      lastSnap = snap();
      view.innerHTML = frame(); draw();
      if (tab === 'build' && !S.blocks.length) { var nl = view.querySelector('[data-newline]'); if (nl) nl.focus(); }
    });
    return {
      ready: ready,
      destroy: function () { if (dirty) save(); closeMenu(); document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); if (prevCtl) prevCtl.destroy(); }
    };
  });
})();

/* ===== f.html ===== */
(function () {
  var esc = UI.esc;
  function params() {
    var h = location.hash, i = h.indexOf('?'), out = {};
    if (i < 0) return out;
    h.slice(i + 1).split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('='); try { out[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) {}
    });
    return out;
  }
  function token(slug, fresh) {
    var k = 'fillfox.tok.' + slug, tok = null;
    try { tok = fresh ? null : localStorage.getItem(k); } catch (e) {}
    if (!tok) { tok = FF.uid(24); try { localStorage.setItem(k, tok); } catch (e) {} }
    return tok;
  }
  function report(slug) {
    var reasons = [['phishing', 'It asks for passwords or bank details'], ['spam', 'Spam or a scam'], ['impersonation', 'It pretends to be someone else'],
                   ['illegal', 'Illegal or harmful content'], ['other', 'Something else']];
    var m = UI.modal('<h2>Report this form</h2><p class="muted">Tell us what\'s wrong. Forms that collect passwords or pretend to be another company are taken down.</p>' +
      '<form class="ui-stack ff-report" data-rep><div class="ui-choices">' + reasons.map(function (r, i) {
        return '<label class="ui-choice"><input type="radio" name="reason" value="' + r[0] + '"' + (i ? '' : ' checked') + '><span>' + esc(r[1]) + '</span></label>';
      }).join('') + '</div><label class="ui-field"><span>Details <em>(optional)</em></span><textarea name="details" rows="3" maxlength="1000"></textarea></label>' +
      '<label class="ui-field"><span>Your email <em>(optional, if we may follow up)</em></span><input type="email" name="email"></label>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('flag') + 'Send report</button></div></form>');
    m.el.querySelector('[data-rep]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('report_form', slug, v.reason, v.details, v.email)).then(function () {
        m.close(); UI.toast('Thank you. We\'ll look at it.', 'ok');
      });
    });
  }

  UI.page('f', { title: function () { return 'Form'; }, chrome: false }, function (view, ctx) {
    var slug = ctx.args[0], p = params(), preview = p.preview === '1', embed = p.embed === '1', ctl = null;
    delete p.preview; delete p.embed;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px;max-width:680px;margin:40px auto"></div></div>';
    if (embed) document.documentElement.style.background = 'transparent';
    function closed(d) {
      view.innerHTML = '<div class="ffr"><div class="ffr-in ffr-closed"><div class="ffr-end"><div class="tick" style="background:var(--c-ink);color:var(--c-bg)">' + UI.icon('lock') + '</div>' +
        (d.title ? '<h2>' + esc(d.title) + '</h2>' : '') + '<p>' + esc(d.message || 'This form isn\'t available.') + '</p></div>' +
        '<footer class="ffr-foot"><a class="brand" href="#landing" data-go="landing"><img src="_/theme/icon.svg" alt="">Made with Fillfox</a><span>Make your own forms, free.</span></footer></div></div>';
    }
    var ready = UI.api('get_public_form', slug, preview).then(function (d) {
      if (d.closed) { closed(d); return; }
      var form = d.form, tok = token(form.slug);
      document.title = form.title + ' · Fillfox';
      ctl = FF.render(view, form, {
        mode: d.preview ? 'preview' : 'live', embed: embed, params: p, token: d.preview ? 'preview' : tok,
        onPayOpen: function () { if (!d.preview) UI.apiQuiet('fill_progress', form.slug, tok, 0, null).catch(function () {}); },
        onProgress: function (reached, answers) { UI.apiQuiet('fill_progress', form.slug, tok, reached, answers).catch(function () {}); },
        upload: d.preview ? null : function (file, bid) { return UI.upload('upload_file', file, form.slug, tok, bid); },
        onSubmit: d.preview ? null : function (answers, meta) {
          return UI.apiQuiet('submit_response', form.slug, tok, answers, meta).then(function (r) { token(form.slug, true); return r; });
        },
        onRestart: function () { tok = token(form.slug, true); location.reload(); },
        onReport: function () { report(form.slug); }
      });
    }, function (e) { closed({ message: e.message }); });
    return { ready: ready, destroy: function () { if (ctl) ctl.destroy(); } };
  });
})();

/* ===== forms.html ===== */
(function () {
  var esc = UI.esc;
  var SAMPLE = 'Your name *\nEmail *\nWhich workshop? (Pottery / Weaving / Printmaking)\nHow did you hear about us?\n- Instagram\n- A friend\n- Walking by\nHow would you rate our last event?\nAnything else you\'d like to tell us?';

  function card(f) {
    var link = f.role === 'viewer' ? 'results/' + f.id : 'edit/' + f.id;
    return '<article class="fm-card" style="--acc:' + esc(f.accent) + '" data-id="' + esc(f.id) + '">' +
      '<div class="row">' + FF.statusBadge(f.status, f.open) + (f.layout === 'focus' ? '<span class="ui-badge">1 at a time</span>' : '') + (f.quiz ? '<span class="ui-badge accent">Quiz</span>' : '') +
      (f.demo ? '<span class="ui-badge">Example · ' + esc(f.owner) + '</span>' : f.role === 'editor' ? '<span class="ui-badge">Shared by ' + esc(f.owner) + '</span>' : '') + '</div>' +
      '<h3><a href="#' + link + '" data-go="' + link + '">' + esc(f.title) + '</a></h3>' +
      '<p class="small muted" style="margin:0">' + UI.plural(f.questions, 'question') + (f.last_response ? ' · last answer ' + esc(UI.ago(f.last_response)) : ' · updated ' + esc(UI.ago(f.updated))) + '</p>' +
      '<div class="fm-nums"><div><b>' + f.responses + '</b><span>answers</span></div><div><b>' + (f.completion == null ? '–' : f.completion + '%') + '</b><span>finish</span></div>' + FF.spark(f.spark) + '</div>' +
      '<div class="fm-acts">' + (f.role === 'viewer'
        ? '<a class="ui-btn ghost" href="#results/' + esc(f.id) + '" data-go="results/' + esc(f.id) + '">' + UI.icon('chart') + 'Results</a>' +
          '<a class="ui-btn ghost" href="#f/' + esc(f.slug) + '" data-go="f/' + esc(f.slug) + '">' + UI.icon('play') + 'Try it</a>' +
          '<button class="ui-btn ghost" data-dup>' + UI.icon('copy') + 'Use a copy</button>'
        : '<a class="ui-btn ghost" href="#edit/' + esc(f.id) + '" data-go="edit/' + esc(f.id) + '">' + UI.icon('edit') + 'Edit</a>' +
          '<a class="ui-btn ghost" href="#results/' + esc(f.id) + '" data-go="results/' + esc(f.id) + '">' + UI.icon('chart') + 'Results</a>' +
          (f.status === 'live' ? '<button class="ui-btn ghost" data-link="' + esc(f.slug) + '">' + UI.icon('link') + 'Link</button>' : '') +
          '<span class="ui-spacer"></span><button class="ui-btn ghost icon" data-more aria-label="More for ' + esc(f.title) + '">' + UI.icon('more') + '</button>') + '</div></article>';
  }

  /* New form: blank, template, paste, import. Opens the editor on success. */
  FF.newForm = function (tab) {
    tab = tab || 'start';
    var m = UI.modal('<h2>New form</h2><div class="fm-new-tabs" role="tablist">' +
      [['start', 'Blank', 'plus'], ['tpl', 'Template', 'grid'], ['paste', 'Paste questions', 'paste'], ['google', 'Google Forms', 'gform'], ['import', 'JSON', 'download']].map(function (x) {
        return '<button type="button" data-tab="' + x[0] + '" class="' + (x[0] === tab ? 'on' : '') + '">' + UI.icon(x[2]) + '<span>' + x[1] + '</span></button>';
      }).join('') + '</div><div data-panel></div>', { wide: true });
    var panel = m.el.querySelector('[data-panel]');
    function make(title, blocks, settings, btn) {
      return UI.busy(btn, UI.api('create_form', title, blocks, settings)).then(function (r) { m.close(); UI.go('edit', r.id); });
    }
    function draw() {
      m.el.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
      if (tab === 'start') {
        panel.innerHTML = '<form class="ui-stack" data-blank><label class="ui-field"><span>Form title</span><input type="text" name="title" placeholder="e.g. Volunteer sign-up" maxlength="160" required></label>' +
          '<p class="ui-hint">You\'ll write it like a document: type a question and press Enter, or press / for every block.</p>' +
          '<div class="ui-row end"><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Create</button></div></form>';
      } else if (tab === 'tpl') {
        panel.innerHTML = '<div class="fm-tpls">' + FF.TEMPLATES.map(function (t) {
          return '<button type="button" class="fm-tpl" style="--acc:' + esc(t.settings.accent) + '" data-tpl="' + t.key + '"><i>' + esc(t.cat) + '</i><b>' + esc(t.title) + '</b><span>' + esc(t.desc) + '</span></button>';
        }).join('') + '</div>';
      } else if (tab === 'paste') {
        panel.innerHTML = '<form class="ui-stack fm-paste" data-paste><label class="ui-field"><span>Your questions, one per line</span><textarea name="text" spellcheck="false">' + esc(SAMPLE) + '</textarea></label>' +
          '<p class="ui-hint">Fillfox guesses each type: emails, dates, numbers, ratings, yes/no. Options go after a question in brackets <code>(A / B)</code> or on lines starting with <code>-</code>. A <code>*</code> makes it required. <code>---</code> starts a new page.</p>' +
          '<div class="fm-guess" data-guess></div><div class="ui-row end"><button class="ui-btn primary" type="submit">' + UI.icon('wand') + 'Make the form</button></div></form>';
        guess();
      } else if (tab === 'google') {
        panel.innerHTML = '<form class="ui-stack" data-gform><label class="ui-field"><span>Link to the Google Form</span><input type="url" name="url" placeholder="https://docs.google.com/forms/d/e/…/viewform or https://forms.gle/…" required></label>' +
          '<p class="ui-hint">Use the link people fill in (Send → link). The form must accept answers from anyone with the link. Questions, choices, required marks, scales, grids, sections and descriptions come across; images and videos don\'t. Answers stay in Google.</p>' +
          '<div data-gout></div><div class="ui-row end"><button class="ui-btn primary" type="submit">' + UI.icon('download') + 'Import</button></div></form>';
      } else {
        panel.innerHTML = '<form class="ui-stack" data-import><p class="muted">Bring back a form you exported from Fillfox (Share → Export as JSON).</p><input type="file" accept=".json,application/json" name="file">' +
          '<div class="ui-row end"><button class="ui-btn primary" type="submit">' + UI.icon('download') + 'Import</button></div></form>';
      }
    }
    function guess() {
      var ta = panel.querySelector('textarea'), box = panel.querySelector('[data-guess]');
      if (!ta || !box) return;
      var blocks = FF.parseQuestions(ta.value);
      box.innerHTML = blocks.length ? blocks.map(function (b) {
        return '<div><span class="ui-badge">' + esc(FF.TYPES[b.type].label) + '</span><span>' + esc(b.label || '(page break)') + (b.options ? ' <span class="faint">· ' + b.options.length + ' options</span>' : '') + (b.required ? ' <span class="faint">· required</span>' : '') + '</span></div>';
      }).join('') : '<span class="faint">Your questions will show up here.</span>';
    }
    m.el.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.getAttribute('data-tab'); draw(); return; }
      var tp = e.target.closest('[data-tpl]');
      if (tp) { var t = FF.instantiate(FF.template(tp.getAttribute('data-tpl'))); make(t.title, t.blocks, t.settings, tp); }
    });
    m.el.addEventListener('input', function (e) { if (e.target.name === 'text') guess(); });
    m.el.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('[type=submit]');
      if (f.matches('[data-blank]')) make(f.title.value || 'Untitled form', [], {}, btn);
      if (f.matches('[data-paste]')) {
        var blocks = FF.parseQuestions(f.text.value);
        if (!blocks.length) { UI.toast('Type at least one question.', 'error'); return; }
        make('Untitled form', blocks, {}, btn);
      }
      if (f.matches('[data-gform]')) {
        UI.busy(btn, UI.api('import_google_form', f.url.value)).then(function (r) {
          if (r.skipped && r.skipped.length) UI.toast('Imported ' + UI.plural(r.questions, 'question') + '. Skipped: ' + r.skipped.map(function (x) { return x.why; }).join(', ') + '.');
          return make(r.title, r.blocks, r.settings, btn);
        }, function (err) { f.querySelector('[data-gout]').innerHTML = '<div class="ui-error">' + UI.esc(err.message) + '</div>'; });
      }
      if (f.matches('[data-import]')) {
        var file = f.file.files[0];
        if (!file) { UI.toast('Choose a .json file first.', 'error'); return; }
        file.text().then(function (txt) {
          var d; try { d = JSON.parse(txt); } catch (x) { UI.toast('That isn\'t a Fillfox JSON file.', 'error'); return; }
          if (!d || !Array.isArray(d.blocks)) { UI.toast('That isn\'t a Fillfox JSON file.', 'error'); return; }
          make(d.title || 'Imported form', d.blocks, d.settings || {}, btn);
        });
      }
    });
    draw();
    return m;
  };

  UI.page('forms', { title: 'Forms', nav: 'Forms', icon: 'form', auth: 'user', order: 10 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:320px"></div></div>';
    var data = null;
    function draw(d) {
      data = d;
      var first = ctx.me.name.split(' ')[0];
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Fillfox / ' + esc(first) + '</div><h1>Your forms</h1></div>' +
        '<div class="ui-row"><a class="ui-btn" href="#templates" data-go="templates">' + UI.icon('grid') + 'Templates</a><button class="ui-btn primary" data-new>' + UI.icon('plus') + 'New form</button></div></div>' +
        '<div class="fm-top"><div><b class="num">' + d.totals.forms + '</b><span>forms</span></div><div><b class="num">' + d.totals.responses + '</b><span>answers, all time</span></div>' +
        '<div><b class="num">' + d.mine.filter(function (f) { return f.status === 'live'; }).length + '</b><span>live now</span></div></div>' +
        (d.mine.length ? '<div class="fm-list">' + d.mine.map(card).join('') + '</div>'
          : '<div class="fm-empty"><div><h3>Make your first form</h3><p class="muted" style="margin:0">Start blank, pick a template, or paste a list of questions and Fillfox builds it.</p></div>' +
            '<div class="ui-row"><button class="ui-btn" data-new="paste">' + UI.icon('paste') + 'Paste questions</button><button class="ui-btn primary" data-new>' + UI.icon('plus') + 'New form</button></div></div>') +
        (d.shared.length ? '<div class="fm-sec"><h2>Shared with you</h2><span>' + d.shared.length + '</span></div><div class="fm-list">' + d.shared.map(card).join('') + '</div>' : '') +
        (d.examples.length ? '<div class="fm-sec"><h2>Examples to explore</h2><span>read-only · real-looking results, made-up people</span></div><div class="fm-list">' + d.examples.map(card).join('') + '</div>' : '') +
        '</div>';
    }
    function load() { return UI.api('my_forms').then(draw); }
    view.addEventListener('click', function (e) {
      var n = e.target.closest('[data-new]'); if (n) { FF.newForm(n.getAttribute('data-new') || 'start'); return; }
      var card = e.target.closest('[data-id]'), id = card && card.getAttribute('data-id');
      var lk = e.target.closest('[data-link]'); if (lk) { FF.copy(FF.formUrl(lk.getAttribute('data-link')), 'Link copied'); return; }
      if (e.target.closest('[data-dup]')) { UI.api('duplicate_form', id).then(function (r) { UI.toast('Copied into your forms', 'ok'); UI.go('edit', r.id); }); return; }
      if (e.target.closest('[data-more]')) {
        var f = data.mine.concat(data.shared).filter(function (x) { return x.id === id; })[0];
        var m = UI.modal('<h2>' + esc(f.title) + '</h2><div class="ui-stack">' +
          '<button class="ui-btn block" data-a="dup">' + UI.icon('copy') + 'Duplicate</button>' +
          '<a class="ui-btn block" href="#f/' + esc(f.slug) + '?preview=1" data-a="preview">' + UI.icon('eye') + 'Preview</a>' +
          (f.role === 'owner' ? '<button class="ui-btn block danger" data-a="del">' + UI.icon('trash') + 'Delete form and its answers</button>' : '') + '</div>');
        m.el.addEventListener('click', function (ev) {
          var a = ev.target.closest('[data-a]'); if (!a) return;
          var act = a.getAttribute('data-a');
          if (act === 'preview') { m.close(); return; }
          if (act === 'dup') UI.busy(a, UI.api('duplicate_form', id)).then(function () { m.close(); UI.toast('Duplicated', 'ok'); load(); });
          if (act === 'del') {
            m.close();
            UI.confirm({ title: 'Delete “' + f.title + '”?', text: 'Its ' + UI.plural(f.responses, 'answer') + ' and uploaded files are deleted too. This can\'t be undone.', ok: 'Delete', danger: true })
              .then(function (yes) { if (yes) UI.api('delete_form', id).then(function () { UI.toast('Deleted'); load(); }); });
          }
        });
      }
    });
    return load().then(function () {
      var pending = UI.store.get('pendingTemplate', null);
      if (pending && FF.template(pending)) {
        UI.store.set('pendingTemplate', null);
        var t = FF.instantiate(FF.template(pending));
        UI.api('create_form', t.title, t.blocks, t.settings).then(function (r) { UI.toast('Template copied into your forms', 'ok'); UI.go('edit', r.id); });
      }
    });
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Free form builder',
    title: 'Forms people <em>finish</em>.',
    lead: 'Write a form like a document, share one link, and see every answer, plus exactly where people gave up. Everything is free. There is no paid plan.',
    cta: 'Make a form, free',
    proof: ['No paid plan, no answer limits', 'No tracking scripts', 'Made in Montréal'],
    stepsTitle: 'How it works',
    stepsLead: 'From blank page to answers in a few minutes.',
    steps: [['Write it', 'Type a question and press Enter: Fillfox guesses the type. Or paste a list of questions, or start from one of 12 templates.'],
            ['Share it', 'A link, a QR code, or an embed that resizes itself on your website. Pre-fill answers through the link.'],
            ['Learn from it', 'A chart for every question, NPS and quiz scores, and a funnel that shows the question where people stop.']],
    featuresTitle: 'Everything, without the paywall',
    features: [['funnel', 'See where people stop', 'Drop-off per question and the answers people typed before leaving. Most builders keep this for paid plans.'],
               ['play', 'One question at a time', 'Or classic pages. Big type, Enter to continue, letter keys to pick. Answers are kept on the device if the connection drops.'],
               ['branch', 'Logic in plain sentences', '“Show this when ‘Will you come?’ is ‘Yes’.” Hide single questions or whole pages.'],
               ['calc', 'Calculations and quizzes', 'Live totals for quotes and orders. Correct answers, points, and a different ending for each score.'],
               ['shield', 'Safe by design', 'No password fields. Phishing wording is caught before publishing, and every form has a report link.'],
               ['lock', 'Privacy built in', 'Delete answers automatically after 30 days to 2 years, erase one person on request, add your privacy contact.'],
               ['check', 'Accessible', 'Real labels, keyboard use everywhere, clear error messages, and signatures you can type instead of draw.'],
               ['team', 'Teammates, free', 'Invite people by email to edit, publish and read answers. No per-seat pricing.'],
               ['webhook', 'Your data, your way', 'CSV export, webhooks to Zapier, Make or your server, and the form itself as JSON.']],
    faq: [['Is it really free?', 'Yes. Every feature is free and there is no paid plan. Uploads are limited to 10 MB a file, and gentle rate limits stop spam bots.'],
          ['What\'s the catch?', 'There are no ads and we never sell data. Every form shows a small Fillfox footer with “never submit passwords” and a report link: that\'s how a free form host stays clear of phishing.'],
          ['Who can see the answers?', 'Only you and the teammates you add. The people answering don\'t need an account, and Fillfox doesn\'t store their IP address.'],
          ['Can I put a form on my website?', 'Yes. Copy the embed code from Share. The form resizes itself to fit, and works inside any page.'],
          ['Does it work in French?', 'Forms can speak English, French, Spanish, German, Portuguese or Latvian: buttons, messages and errors follow the language you pick.'],
          ['Can I take my data with me?', 'Any time: answers as CSV, the form as JSON, and a webhook for every new answer.']],
    bandTitle: 'Your first form takes two minutes.',
    bandLead: 'Paste a list of questions and Fillfox builds it for you.'
  };

  function heroArt() {
    var cells = ''; for (var i = 0; i <= 10; i++) cells += '<span' + (i === 9 ? ' class="on"' : '') + '>' + i + '</span>';
    var fr = [['VIEW', 100, '140'], ['Q01', 86, '120'], ['Q02', 81, '113'], ['Q03', 77, '108'], ['Q04', 55, '77', 1], ['Q05', 52, '73'], ['SENT', 51, '72']];
    return '<div class="lp-art" aria-hidden="true"><div class="lp-sheet"><div class="cov"></div><div class="in"><h4>Café Lumière: how was your visit?</h4><div class="meta">7 QUESTIONS · ~2 MIN</div>' +
      '<div class="q"><i>02</i>How likely are you to recommend us?</div><div class="lp-cells">' + cells + '</div>' +
      '<div class="q"><i>03</i>What did you have today?</div><div class="lp-opt on"><kbd>A</kbd>Espresso drink</div><div class="lp-opt"><kbd>B</kbd>Filter coffee</div><div class="lp-opt on"><kbd>C</kbd>Pastry</div>' +
      '<span class="lp-btn">Next ' + UI.icon('arrow') + '</span></div></div>' +
      '<div class="lp-funnel"><h5><span>Drop-off</span><span>72 / 140</span></h5>' + fr.map(function (r) { return '<div class="lp-fr' + (r[3] ? ' worst' : '') + '"><span>' + r[0] + '</span><b style="width:' + r[1] + '%"></b><span>' + r[2] + '</span></div>'; }).join('') +
      '<div class="lp-tag"><b>−29% at Q04</b> “Rate the coffee”</div></div></div>';
  }

  UI.page('landing', { title: 'Welcome' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#forms" data-go="forms">Your forms ' + UI.icon('arrow') + '</a><a class="ui-btn lg" href="#templates" data-go="templates">Templates</a>'
      : '<a class="ui-btn primary lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + ' ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn lg" href="#templates" data-go="templates">' + UI.icon('play') + 'Try a template</a>';
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
        '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Free here. Paid plans elsewhere.</h2><p>Things form builders often charge for, included for everyone.</p></div><div class="lp-free">' +
        [['Drop-off per question', 'see the question that loses people'], ['Unfinished answers', 'what people typed before leaving'], ['Automatic deletion', 'answers removed after a set time'],
         ['Teammates', 'invite by email, no per-seat price'], ['Quiz endings by score', 'a different message for each result'], ['Answer copies by email', 'respondents get what they sent']].map(function (x) {
          return '<div>' + UI.icon('check') + '<span>' + esc(x[0]) + '<small>' + esc(x[1]) + '</small></span></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
        (me ? '<a class="ui-btn lg" href="#forms" data-go="forms">Your forms</a>' : '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + '</a>') +
      '</div></div></section>';
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== results.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['summary', 'Summary', 'chart'], ['answers', 'Answers', 'inbox'], ['dropoff', 'Drop-off', 'funnel'], ['unfinished', 'Unfinished', 'clock']];

  function pct(n, d) { return d ? Math.round(100 * n / d) : 0; }
  function bars(rows, total, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return '<div class="rs-bars">' + rows.map(function (r, i) {
      return '<div class="rs-bar' + (r[2] ? ' ok' : i === 0 && r[1] && !opts.noTop ? ' top' : '') + '"><span class="t">' + (r[2] ? '✓ ' : '') + esc(r[0]) + '</span><span class="v">' + r[1] + ' · ' + pct(r[1], total) + '%</span>' +
        '<div class="track"><i style="width:' + (100 * r[1] / max).toFixed(1) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function median(xs) { var a = xs.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(a.length / 2); return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : 0; }
  function fmt(n) { return FF.fmtNum(n, Math.abs(n) < 10 ? 1 : 0); }

  function summaryCard(b, i, rs, num, quiz, D) {
    var vals = rs.map(function (r) { return r.answers[b.id]; }).filter(function (v) { return !FF.isEmpty(v); });
    var n = vals.length, head = '<h3><span class="rs-n">' + num + '</span>' + esc(b.label || b.key) + '</h3><p class="sub">' + FF.TYPES[b.type].label + ' · ' + n + ' answered' + (rs.length ? ' · ' + pct(n, rs.length) + '%' : '') + '</p>';
    var body = '', wide = false;
    if (!n) return '<div class="rs-q">' + head + '<p class="muted small">No answers yet.</p></div>';
    var t = b.type;
    if (t === 'choice' || t === 'dropdown' || t === 'multi') {
      var c = {}; vals.forEach(function (v) { [].concat(v).forEach(function (x) { var k = typeof x === 'string' && x.indexOf('other:') === 0 ? 'other:' : x; c[k] = (c[k] || 0) + 1; }); });
      var rows = (b.options || []).map(function (o) { return [o.label, c[o.id] || 0, quiz && (b.correct || []).indexOf(o.id) >= 0]; });
      if (c['other:']) rows.push(['Other (typed)', c['other:']]);
      rows.sort(function (a, z) { return z[1] - a[1]; });
      if (rows.length > 12) { rows = rows.filter(function (r) { return r[1]; }).slice(0, 12); }
      if (quiz && b.correct && b.correct.length) {
        var right = vals.filter(function (v) { return t === 'multi' ? Array.isArray(v) && v.slice().sort().join() === b.correct.slice().sort().join() : b.correct.indexOf(v) >= 0; }).length;
        body += '<div class="rs-big"><b>' + pct(right, n) + '%</b><span>got it right</span></div>';
      }
      body += bars(rows, n, { noTop: quiz });
    } else if (t === 'yesno') {
      var y = vals.filter(function (v) { return v === 'yes'; }).length;
      body = '<div class="rs-big"><b>' + pct(y, n) + '%</b><span>said yes</span></div>' + bars([['Yes', y], ['No', n - y]], n, { noTop: true });
    } else if (t === 'rating') {
      var mx = b.props.max || 5, avg = vals.reduce(function (s, v) { return s + v; }, 0) / n, cnt = [];
      for (var k = mx; k >= 1; k--) cnt.push([k + ' ★', vals.filter(function (v) { return v === k; }).length]);
      body = '<div class="rs-big"><b>' + avg.toFixed(1) + '</b><span>out of ' + mx + ' on average</span></div>' + bars(cnt, n, { noTop: true });
    } else if (t === 'scale') {
      var lo = b.props.min == null ? 0 : b.props.min, hi = b.props.max == null ? 10 : b.props.max, hist = [], hmax = 1;
      for (var s = lo; s <= hi; s++) { var hc = vals.filter(function (v) { return v === s; }).length; hist.push([s, hc]); hmax = Math.max(hmax, hc); }
      var nps = lo === 0 && hi === 10;
      if (nps) {
        var P = vals.filter(function (v) { return v >= 9; }).length, Dt = vals.filter(function (v) { return v <= 6; }).length, Pa = n - P - Dt, score = pct(P, n) - pct(Dt, n);
        body = '<div class="rs-big"><b>' + (score > 0 ? '+' : '') + score + '</b><span>Net Promoter Score · average ' + (vals.reduce(function (a, v) { return a + v; }, 0) / n).toFixed(1) + '</span></div>' +
          '<div class="rs-nps"><i style="width:' + pct(Dt, n) + '%;background:var(--c-bad)"></i><i style="width:' + pct(Pa, n) + '%;background:var(--c-faint)"></i><i style="width:' + pct(P, n) + '%;background:var(--c-good)"></i></div>' +
          '<div class="rs-legend"><span><i style="background:var(--c-bad)"></i>' + pct(Dt, n) + '% detractors</span><span><i style="background:var(--c-faint)"></i>' + pct(Pa, n) + '% passives</span><span><i style="background:var(--c-good)"></i>' + pct(P, n) + '% promoters</span></div>';
      } else body = '<div class="rs-big"><b>' + (vals.reduce(function (a, v) { return a + v; }, 0) / n).toFixed(1) + '</b><span>average</span></div>';
      body += '<div class="rs-hist" aria-label="How many people picked each number">' + hist.map(function (h) {
        return '<div title="' + h[0] + ': ' + h[1] + '"><i class="' + (nps ? (h[0] >= 9 ? 'g' : h[0] >= 7 ? 'p' : 'd') : '') + '" style="height:' + (100 * h[1] / hmax).toFixed(0) + '%"></i><span>' + h[0] + '</span></div>';
      }).join('') + '</div>';
      wide = nps;
    } else if (t === 'number' || t === 'calc') {
      var xs = vals.map(Number).filter(function (x) { return !isNaN(x); }), sum = xs.reduce(function (a, v) { return a + v; }, 0), pre = t === 'calc' ? (b.props.prefix || '') : '';
      body = '<div class="rs-big"><b>' + pre + fmt(sum / xs.length) + '</b><span>average' + (b.props.unit ? ' ' + esc(b.props.unit) : '') + '</span></div>' +
        '<div class="rs-bars">' + [['Lowest', Math.min.apply(null, xs)], ['Median', median(xs)], ['Highest', Math.max.apply(null, xs)], ['Total', sum]].map(function (r) {
          return '<div class="rs-bar"><span class="t">' + r[0] + '</span><span class="v">' + esc(pre + fmt(r[1])) + '</span></div>';
        }).join('') + '</div>';
    } else if (t === 'ranking') {
      var pos = {}; (b.options || []).forEach(function (o) { pos[o.id] = 0; });
      vals.forEach(function (v) { v.forEach(function (oid, j) { if (oid in pos) pos[oid] += j + 1; }); });
      var rk = (b.options || []).map(function (o) { return [o.label, pos[o.id] / n]; }).sort(function (a, z) { return a[1] - z[1]; });
      body = '<p class="small muted">Average position (1 = top):</p>' + rk.map(function (r, j) { return '<div class="rs-bar' + (j === 0 ? ' top' : '') + '"><span class="t"><b class="mono">' + (j + 1) + '.</b> ' + esc(r[0]) + '</span><span class="v">' + r[1].toFixed(1) + '</span></div>'; }).join('');
    } else if (t === 'file') {
      var files = []; vals.forEach(function (v) { files = files.concat(v); });
      body = '<div class="rs-big"><b>' + files.length + '</b><span>files</span></div><ul class="rs-texts">' + files.slice(0, 8).map(function (f) { return '<li><a href="' + esc(D.file_base + '?key=' + encodeURIComponent(f.key)) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a><small>' + (f.size / 1048576).toFixed(1) + ' MB</small></li>'; }).join('') + '</ul>';
    } else if (t === 'signature' || t === 'consent') {
      body = '<div class="rs-big"><b>' + pct(n, rs.length) + '%</b><span>' + (t === 'consent' ? 'agreed' : 'signed') + '</span></div>';
    } else {
      var freq = {}; vals.forEach(function (v) { var k = String(v).trim().toLowerCase(); freq[k] = (freq[k] || 0) + 1; });
      var reps = Object.keys(freq).filter(function (k) { return freq[k] > 1; }).sort(function (a, z) { return freq[z] - freq[a]; });
      if (reps.length >= 2 && t === 'short') body = bars(reps.slice(0, 6).map(function (k) { return [k, freq[k]]; }), n) + '<p class="sub" style="margin-top:12px">Latest</p>';
      if (t === 'date') { var ds = vals.slice().sort(); body = '<div class="rs-big"><span>From</span><b style="font-size:1.2rem">' + esc(UI.fmtDate(ds[0])) + '</b><span>to</span><b style="font-size:1.2rem">' + esc(UI.fmtDate(ds[ds.length - 1])) + '</b></div>'; }
      body += '<ul class="rs-texts">' + rs.filter(function (r) { return !FF.isEmpty(r.answers[b.id]); }).slice(0, 8).map(function (r) {
        return '<li>' + esc(FF.display(b, r.answers[b.id])) + '<small>' + esc(UI.ago(r.submitted || r.started)) + '</small></li>';
      }).join('') + '</ul>';
      wide = t === 'long';
    }
    return '<div class="rs-q' + (wide ? ' wide' : '') + '">' + head + body + '</div>';
  }

  UI.page('results', { title: 'Results', auth: 'user' }, function (view, ctx) {
    var id = ctx.args[0], tab = TABS.some(function (t) { return t[0] === ctx.args[1]; }) ? ctx.args[1] : 'summary';
    var D = null, query = '';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';

    function inputs() { return D.form.blocks.filter(function (b) { return FF.isInput(b) && b.type !== 'hidden'; }).concat(D.form.blocks.filter(function (b) { return b.type === 'hidden'; })); }
    function frame() {
      var f = D.form, ro = D.role === 'viewer', fu = D.funnel;
      var secs = D.responses.map(function (r) { return r.seconds; }).filter(Boolean), phones = D.responses.filter(function (r) { return r.device === 'phone'; }).length;
      return '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Results</div><h1>' + esc(f.title) + '</h1>' +
        '<p class="muted">' + FF.statusBadge(f.status, f.open) + ' ' + (f.demo ? 'Example by ' + esc(f.owner) + ' · made-up people' : '') + '</p></div><div class="ui-row">' +
        (ro ? '<button class="ui-btn primary" data-dup>' + UI.icon('copy') + 'Use a copy</button>' : '<a class="ui-btn" href="#edit/' + id + '" data-go="edit/' + id + '">' + UI.icon('edit') + 'Edit form</a>') +
        '<a class="ui-btn" href="#f/' + esc(f.slug) + '" data-go="f/' + esc(f.slug) + '">' + UI.icon('play') + 'Open form</a>' +
        '<button class="ui-btn" data-csv>' + UI.icon('download') + 'CSV</button></div></div>' +
        (ro ? '<div class="rs-ro">' + UI.icon('eye') + '<span>This is an example form with made-up answers. Copy it to collect your own.</span></div>' : '') +
        '<div class="rs-kpis"><div><b>' + fu.views + '</b><span>views</span></div><div><b>' + fu.starts + '</b><span>started</span></div><div><b>' + D.responses.length + '</b><span>finished</span></div>' +
        '<div><b>' + pct(D.responses.length, fu.starts) + '%</b><span>finish rate</span></div><div><b>' + (secs.length ? Math.round(median(secs) / 6) / 10 : '–') + '</b><span>median min</span></div>' +
        '<div><b>' + pct(phones, D.responses.length) + '%</b><span>on phones</span></div></div>' +
        '<nav class="ui-tabs">' + TABS.map(function (t) {
          var c = t[0] === 'answers' ? D.responses.length : t[0] === 'unfinished' ? D.partial_count : null;
          return '<a href="#results/' + id + '/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + (c != null ? ' <span class="count">' + c + '</span>' : '') + '</a>';
        }).join('') + '</nav><div data-body></div></div>';
    }

    function drawSummary(body) {
      var rs = D.responses, nums = {}, i = 0, quiz = D.form.settings.quiz;
      D.form.blocks.forEach(function (b) { if (FF.isAsked(b)) { i++; nums[b.id] = (i < 10 ? '0' : '') + i; } });
      var html = '';
      if (quiz && rs.length) {
        var scores = rs.map(function (r) { return r.score || 0; }), mx = D.quiz_max || Math.max.apply(null, scores.concat([1])), hist = [], hm = 1;
        for (var s = 0; s <= mx; s++) { var c = scores.filter(function (x) { return x === s; }).length; hist.push([s, c]); hm = Math.max(hm, c); }
        html += '<div class="rs-q wide"><h3>' + UI.icon('trophy') + ' Quiz scores</h3><p class="sub">' + rs.length + ' scored</p><div class="rs-big"><b>' + (scores.reduce(function (a, v) { return a + v; }, 0) / rs.length).toFixed(1) + '</b><span>average out of ' + mx + ' · ' + pct(scores.filter(function (x) { return x === mx; }).length, rs.length) + '% perfect</span></div>' +
          '<div class="rs-hist">' + hist.map(function (h) { return '<div title="' + h[0] + ' points: ' + h[1] + '"><i style="height:' + (100 * h[1] / hm).toFixed(0) + '%"></i><span>' + h[0] + '</span></div>'; }).join('') + '</div></div>';
      }
      html += D.form.blocks.filter(function (b) { return FF.isAsked(b) || (b.type === 'calc'); }).map(function (b, k) { return b.type === 'payment' ? payCard(b, rs, nums[b.id]) : summaryCard(b, k, rs, nums[b.id] || '∑', quiz, D); }).join('');
      body.innerHTML = rs.length ? '<div class="rs-grid">' + html + '</div>' : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No answers yet</h3><p>Share the link and they\'ll show up here as they arrive.</p>' +
        (D.role !== 'viewer' ? '<a class="ui-btn primary" href="#edit/' + id + '/share" data-go="edit/' + id + '/share">' + UI.icon('share') + 'Share the form</a>' : '') + '</div>';
    }

    function money(cents, cur) { return cents == null ? '' : (cents / 100).toLocaleString(undefined, { style: 'currency', currency: cur || 'USD' }); }
    function payCard(b, rs, num) {
      var selfPaid = rs.filter(function (r) { return r.answers[b.id] && r.answers[b.id].confirmed; }), checked = rs.filter(function (r) { return r.paid && r.paid.status === 'paid'; });
      var totals = {}; checked.forEach(function (r) { totals[r.paid.currency] = (totals[r.paid.currency] || 0) + (r.paid.amount || 0); });
      var um = (D.unmatched_payments || []).filter(function (p) { return p.status === 'paid'; });
      return '<div class="rs-q wide"><h3><span class="rs-n">' + (num || '') + '</span>' + esc(b.label || 'Payment') + '</h3><p class="sub">Payment · Stripe</p>' +
        '<div class="rs-big"><b>' + checked.length + '</b><span>paid, checked by Stripe' + (Object.keys(totals).length ? ' · ' + Object.keys(totals).map(function (c) { return money(totals[c], c); }).join(' + ') : '') + '</span></div>' +
        '<p class="small muted" style="margin:0">' + UI.plural(selfPaid.length, 'person', 'people') + ' ticked “I\'ve paid”.' +
        (!checked.length && selfPaid.length ? ' Connect the Stripe webhook (Edit → Settings → Payments) to have Stripe confirm them; until then, match the reference in Stripe\'s payment details (client_reference_id).' : '') + '</p>' +
        (um.length ? '<p class="small" style="margin:10px 0 0"><b>' + UI.plural(um.length, 'payment') + ' without an answer</b> (paid, but never pressed Submit): ' + um.slice(0, 5).map(function (p) { return esc((p.email || 'unknown') + ' ' + money(p.amount, p.currency)); }).join(', ') + '</p>' : '') + '</div>';
    }
    function table(list, partial) {
      var cols = inputs().slice(0, 5), q = query.toLowerCase();
      var rows = list.filter(function (r) { return !q || Object.keys(r.answers).some(function (k) { var b = D.form.blocks.filter(function (x) { return x.id === k; })[0]; return b && FF.display(b, r.answers[k]).toLowerCase().indexOf(q) >= 0; }); });
      return '<div class="rs-tools"><input type="search" data-q placeholder="Search answers" value="' + esc(query) + '" aria-label="Search answers"><span class="muted small">' + UI.plural(rows.length, partial ? 'unfinished answer' : 'answer') + '</span><span class="ui-spacer"></span>' +
        (D.role !== 'viewer' ? '<button class="ui-btn sm" data-erase>' + UI.icon('user') + 'Erase a person\'s answers</button><button class="ui-btn sm danger" data-delall="' + (partial ? 'partial' : 'all') + '">' + UI.icon('trash') + 'Delete all</button>' : '') + '</div>' +
        (rows.length ? '<div class="rs-table-wrap"><table class="rs-table"><thead><tr><th>' + (partial ? 'Started' : 'Sent') + '</th>' + (D.form.settings.quiz && !partial ? '<th>Score</th>' : '') + (partial ? '<th>Got to</th>' : '') +
          cols.map(function (b) { return '<th>' + esc(b.label || b.key) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.slice(0, 500).map(function (r) {
            return '<tr data-r="' + esc(r.id) + '" tabindex="0"><td class="num">' + esc(UI.fmtDateTime(r.submitted || r.started)) + '</td>' + (D.form.settings.quiz && !partial ? '<td class="num">' + (r.score == null ? '' : r.score) + '</td>' : '') +
              (partial ? '<td class="num">Q' + (r.reached + 1) + '</td>' : '') + cols.map(function (b) { return '<td>' + esc(FF.display(b, r.answers[b.id])) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>' + (rows.length > 500 ? '<p class="muted small">Showing the newest 500. The CSV has them all.</p>' : '')
          : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>' + (q ? 'Nothing matches' : partial ? 'No unfinished answers' : 'No answers yet') + '</h3></div>');
    }
    function drawUnfinished(body) {
      if (!D.form.settings.save_partial && !D.form.demo) {
        body.innerHTML = '<div class="rs-callout"><b>' + D.partial_count + ' people started but didn\'t finish.</b>This form doesn\'t keep what they typed. Turn on “Keep unfinished answers” in Settings to see it (and mention it in your description).</div>' +
          (D.role !== 'viewer' ? '<a class="ui-btn" href="#edit/' + id + '/settings" data-go="edit/' + id + '/settings">' + UI.icon('gear') + 'Open settings</a>' : '');
        return;
      }
      body.innerHTML = '<p class="muted">What people typed before they left. They never pressed Submit, so treat it as unfinished.</p>' + table(D.partial, true);
    }
    function drawDropoff(body) {
      var fu = D.funnel, steps = [['', 'Opened the form', fu.views], ['', 'Started answering', fu.starts]];
      var nums = 0;
      fu.steps.forEach(function (s) { nums++; steps.push([(nums < 10 ? 'Q0' : 'Q') + nums, s.label, s.reached]); });
      steps.push(['✓', 'Sent their answers', fu.complete]);
      var worst = -1, worstDrop = 0;
      for (var i = 2; i < steps.length; i++) { var d = steps[i - 1][2] - steps[i][2]; if (d > worstDrop) { worstDrop = d; worst = i; } }
      var max = Math.max(steps[0][2], 1);
      var callout = worst > 0 && fu.starts ? '<div class="rs-callout"><b>Most people leave at “' + esc(steps[worst][1]) + '”</b>' + worstDrop + ' of ' + fu.starts + ' who started (' + pct(worstDrop, fu.starts) + '%) stopped ' + (worst === steps.length - 1 ? 'right before sending.' : 'there.') +
        ' Try making it optional, shorter, or moving it later.</div>' : '';
      body.innerHTML = (fu.starts ? callout + '<div class="rs-funnel">' + steps.map(function (s, i) {
        var lost = i > 0 ? steps[i - 1][2] - s[2] : 0;
        return '<div class="rs-step' + (i === worst ? ' worst' : '') + '"><span class="k">' + esc(s[0]) + '</span><div style="min-width:0"><span class="lbl">' + esc(s[1]) + '</span><div class="bar"><i style="width:' + (100 * s[2] / max).toFixed(1) + '%"></i></div></div>' +
          '<span class="n">' + s[2] + ' · ' + pct(s[2], max) + '%' + (i > 1 && lost > 0 ? '<small>−' + lost + '</small>' : '') + '</span></div>';
      }).join('') + '</div><p class="muted small" style="margin-top:14px">Percentages are of everyone who opened the form. Counted per visit, without cookies or tracking scripts: the form only remembers how far a visit got.</p>'
        : '<div class="ui-empty">' + UI.icon('funnel') + '<h3>Nobody has started yet</h3><p>Once people open the form, you\'ll see where they stop.</p></div>');
    }

    function detail(r) {
      var blocks = D.form.blocks.filter(FF.isInput);
      var m = UI.modal('<div class="rs-detail"><h2>Answer from ' + esc(UI.fmtDateTime(r.submitted || r.started)) + '</h2><p class="muted small">' + (r.status === 'partial' ? 'Unfinished · got to question ' + (r.reached + 1) : 'Took ' + (r.seconds ? Math.max(1, Math.round(r.seconds / 60)) + ' min' : '?') + (r.device ? ' on a ' + esc(r.device) : '')) + (r.score != null ? ' · score ' + r.score : '') + '</p><dl>' +
        blocks.map(function (b) {
          var v = r.answers[b.id], out;
          if (FF.isEmpty(v)) out = '<span class="faint">–</span>';
          else if (b.type === 'signature') out = v.kind === 'draw' ? '<img class="sig" src="' + esc(v.data) + '" alt="Signature">' : '<span class="rs-sig-typed">' + esc(v.name) + '</span>';
          else if (b.type === 'file') out = v.map(function (f) { return '<a href="' + esc(D.file_base + '?key=' + encodeURIComponent(f.key)) + '" target="_blank" rel="noopener">' + UI.icon('download') + ' ' + esc(f.name) + '</a>'; }).join('<br>');
          else if (b.type === 'email') out = '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>';
          else if (b.type === 'payment') out = r.paid && r.paid.status === 'paid' ? '<span class="ui-badge good">' + UI.icon('check') + 'Paid, checked by Stripe · ' + esc(money(r.paid.amount, r.paid.currency)) + '</span>'
            : esc(FF.display(b, v)) + '<br><span class="small faint">Stripe reference (client_reference_id): ' + esc(v.ref || '') + '</span>';
          else out = esc(FF.display(b, v));
          return '<div><dt>' + esc(b.label || b.key) + '</dt><dd>' + out + '</dd></div>';
        }).join('') + '</dl>' + (D.role !== 'viewer' ? '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn danger" data-del>' + UI.icon('trash') + 'Delete this answer</button></div>' : '') + '</div>', { wide: true });
      var del = m.el.querySelector('[data-del]');
      if (del) del.onclick = function () { UI.busy(del, UI.api('delete_response', id, r.id)).then(function () { m.close(); UI.toast('Deleted'); load(); }); };
    }

    function csv() {
      var bl = D.form.blocks.filter(FF.isInput), quiz = D.form.settings.quiz;
      var rows = [['Submitted', 'Status'].concat(quiz ? ['Score'] : []).concat(bl.map(function (b) { return b.label || b.key; }))];
      D.responses.concat(D.partial).forEach(function (r) {
        rows.push([r.submitted || r.started, r.status].concat(quiz ? [r.score == null ? '' : r.score] : []).concat(bl.map(function (b) {
          var v = r.answers[b.id];
          if (b.type === 'file' && v) return v.map(function (f) { return D.file_base + '?key=' + f.key; }).join(' ');
          if (b.type === 'payment') return r.paid && r.paid.status === 'paid' ? 'Paid (Stripe) ' + money(r.paid.amount, r.paid.currency) + ' ref ' + (v && v.ref || '') : v ? FF.display(b, v) + ' ref ' + (v.ref || '') : '';
          return FF.display(b, v);
        })));
      });
      var text = '﻿' + rows.map(function (row) { return row.map(function (c) { c = String(c == null ? '' : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return /[",\n;]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      FF.download((D.form.title || 'answers').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '-answers.csv', text, 'text/csv;charset=utf-8');
    }

    function draw() {
      view.innerHTML = frame();
      var body = view.querySelector('[data-body]');
      if (tab === 'summary') drawSummary(body);
      else if (tab === 'answers') body.innerHTML = table(D.responses, false);
      else if (tab === 'dropoff') drawDropoff(body);
      else drawUnfinished(body);
    }
    function load() { return UI.api('get_results', id).then(function (d) { D = d; draw(); }); }
    view.addEventListener('input', function (e) {
      if (!e.target.matches('[data-q]')) return;
      query = e.target.value; var pos = e.target.selectionStart;
      var body = view.querySelector('[data-body]'); body.innerHTML = tab === 'unfinished' ? '<p class="muted">What people typed before they left.</p>' + table(D.partial, true) : table(D.responses, false);
      var q = view.querySelector('[data-q]'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {}
    });
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-csv]')) { csv(); return; }
      if (e.target.closest('[data-dup]')) { UI.api('duplicate_form', id).then(function (r) { UI.toast('Copied into your forms', 'ok'); UI.go('edit', r.id); }); return; }
      var tr = e.target.closest('tr[data-r]');
      if (tr) { var rid = tr.getAttribute('data-r'); detail(D.responses.concat(D.partial).filter(function (r) { return r.id === rid; })[0]); return; }
      var da = e.target.closest('[data-delall]');
      if (da) {
        var which = da.getAttribute('data-delall');
        UI.confirm({ title: which === 'partial' ? 'Delete every unfinished answer?' : 'Delete every answer?', text: 'Uploaded files go too. This can\'t be undone.', ok: 'Delete all', danger: true })
          .then(function (yes) { if (yes) UI.api('delete_all_responses', id, which).then(function (r) { UI.toast(UI.plural(r.deleted, 'answer') + ' deleted'); load(); }); });
        return;
      }
      if (e.target.closest('[data-erase]')) {
        var m = UI.modal('<h2>Erase a person\'s answers</h2><p class="muted">For privacy requests. Type their email address (or another exact answer of theirs). Every answer containing it is deleted.</p>' +
          '<form class="ui-stack" data-er><input type="text" name="t" placeholder="person@example.com" required><div class="ui-row end"><button class="ui-btn danger solid" type="submit">Erase</button></div></form>');
        m.el.querySelector('[data-er]').addEventListener('submit', function (ev) {
          ev.preventDefault();
          UI.busy(ev.target.querySelector('button'), UI.api('erase_respondent', id, ev.target.t.value)).then(function (r) { m.close(); UI.toast(r.deleted ? UI.plural(r.deleted, 'answer') + ' erased' : 'No answer contained that.', r.deleted ? 'ok' : null); load(); });
        });
      }
    });
    view.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr[data-r]'); if (tr && e.key === 'Enter') tr.click(); });
    return load();
  });
})();

/* ===== templates.html ===== */
(function () {
  var esc = UI.esc;
  function use(key, btn) {
    if (!UI.me) { UI.store.set('pendingTemplate', key); UI.after = '#forms'; UI.toast('Make a free account and the template is waiting for you.'); UI.go('auth', 'signup'); return; }
    var t = FF.instantiate(FF.template(key));
    UI.busy(btn, UI.api('create_form', t.title, t.blocks, t.settings)).then(function (r) { UI.toast('Copied into your forms', 'ok'); UI.go('edit', r.id); });
  }
  function tryIt(key, onClose) {
    var tpl = FF.template(key); if (!tpl) return;
    var t = FF.instantiate(tpl);
    var ov = document.createElement('div'); ov.className = 'ui tp-ov';
    ov.innerHTML = '<div class="tp-ov-bar"><b>TEMPLATE · ' + esc(tpl.title.toUpperCase()) + ' · try it, nothing is saved</b><button class="ui-btn primary" data-use>' + UI.icon('copy') + 'Use this template</button><button class="ui-btn" data-x>' + UI.icon('x') + 'Close</button></div><div data-h></div>';
    document.body.appendChild(ov); document.documentElement.classList.add('ui-modal-open');
    var c = FF.render(ov.querySelector('[data-h]'), { slug: 'tpl-' + key, title: t.title, blocks: t.blocks, settings: t.settings }, { mode: 'template' });
    function close() { c.destroy(); ov.remove(); document.documentElement.classList.remove('ui-modal-open'); document.removeEventListener('keydown', k); if (onClose) onClose(); }
    function k(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', k);
    ov.querySelector('[data-x]').onclick = close;
    ov.querySelector('[data-use]').onclick = function (e) { var b = e.currentTarget; close(); use(key, b); };
    return close;
  }
  FF.tryTemplate = tryIt;

  UI.page('templates', { title: 'Templates', nav: 'Templates', icon: 'grid', order: 20 }, function (view, ctx) {
    var cat = 'All', closer = null;
    var cats = ['All'].concat(FF.TEMPLATES.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    function draw() {
      var list = FF.TEMPLATES.filter(function (t) { return cat === 'All' || t.cat === cat; });
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">' + FF.TEMPLATES.length + ' templates · free</div><h1>Start from a template</h1>' +
        '<p class="muted">Open one to fill it in yourself. Like it? Copy it and change anything.</p></div>' +
        (UI.me ? '<button class="ui-btn primary" data-blank>' + UI.icon('plus') + 'Blank form</button>' : '') + '</div>' +
        '<div class="tp-cats" role="group" aria-label="Category">' + cats.map(function (c) { return '<button type="button" data-cat="' + esc(c) + '" class="' + (c === cat ? 'on' : '') + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
        '<div class="tp-grid">' + list.map(function (t) {
          return '<button type="button" class="tp-card" style="--acc:' + esc(t.settings.accent) + '" data-try="' + t.key + '"><div class="tp-thumb" aria-hidden="true"><div class="sheet"><i class="t"></i><i></i><i style="width:80%"></i><i style="width:70%"></i><i class="b"></i></div></div>' +
            '<div class="tp-body"><i>' + esc(t.cat) + ' · ' + t.blocks.filter(FF.isAsked).length + ' questions' + (t.settings.layout === 'focus' ? ' · 1 at a time' : '') + '</i><b>' + esc(t.title) + '</b><span>' + esc(t.desc) + '</span></div></button>';
        }).join('') + '</div></div>';
    }
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]'); if (c) { cat = c.getAttribute('data-cat'); draw(); return; }
      var t = e.target.closest('[data-try]'); if (t) { closer = tryIt(t.getAttribute('data-try')); return; }
      if (e.target.closest('[data-blank]')) FF.newForm('start');
    });
    draw();
    if (ctx.args[0] && FF.template(ctx.args[0])) closer = tryIt(ctx.args[0]);
    return { ready: Promise.resolve(), destroy: function () { if (closer && document.querySelector('.tp-ov')) closer(); } };
  });
})();
