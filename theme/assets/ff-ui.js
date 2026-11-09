/* ff-ui.js: the small window.UI helpers the JavaScript engines (ff.js, ffr.js, ff-editor.js) were written against,
   kept from the old core.js so the engines run unchanged. Pages, menus and lists are Python Forms; nothing here draws
   a page. Loaded after app-kit.js (which has UI.esc, UI.plural, UI.store, UI.ICONS, UI.icon and the theme).

   Server:  UI.api(fn, ...args) / UI.apiQuiet(...) / UI.upload(fn, file, ...args) -> Promise. They go through
            UI.bridge(kind, payloadJson), which client_code/ff.py sets (anvil.server.call in Python, JSON in and out).
            A reply of {ok: false, error} rejects with that message (a toast unless the engine catches it).
   Helpers: UI.toast (-> state.toast through UI.toastHook), UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate,
            UI.fmtDateTime, UI.ago, UI.go, UI.me (set by Python). */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  UI.me = UI.me || null;

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

  /* Toasts are Anvil Notifications (state.toast), so engine and Forms messages look the same. */
  UI.toastHook = null;
  UI.toast = function (msg, kind) {
    if (UI.toastHook) { try { UI.toastHook(String(msg), kind || ''); return; } catch (e) { /* fall through */ } }
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };

  /* The engine's own small dialogs (logic rules, bulk options, preview, publish ...). */
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" tabindex="-1">' +
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
    setTimeout(function () { var el = first || wrap.querySelector('.ui-modal'); if (el && el.focus) el.focus(); }, 30);
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

  /* ------------------------------------------------------------------ server bridge (set by client_code/ff.py) */
  UI.bridge = null;
  function send(kind, payload) {
    if (!UI.bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = UI.bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
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
  function expected(res) {
    if (res && typeof res === 'object' && res.ok === false) {
      var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
      throw err;
    }
    return res;
  }
  UI.api = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: false }).then(expected); };
  UI.apiQuiet = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: true }).then(expected); };
  /* UI.upload(fn, file, ...args): the server function gets the File as Anvil Media first, then args. */
  UI.upload = function (fn, file) {
    UI._file = file;
    return send('upload', { fn: fn, args: Array.prototype.slice.call(arguments, 2) }).then(function (res) { UI._file = null; return expected(res); },
      function (e) { UI._file = null; throw e; });
  };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* ------------------------------------------------------------------ navigation inside the engines */
  UI.go = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    var h = '#' + [name].concat(args.map(encodeURIComponent)).join('/');
    if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h;
  };
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    window.open('https://prepsto.com/#f/mkr8ttv', '_blank', 'noopener');
  };
  /* The engines' markup uses data-go="page/arg" links and data-feedback buttons (the old core.js handled them). */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback]');
    if (!el) return;
    e.preventDefault();
    if (el.hasAttribute('data-go')) UI.go.apply(null, el.getAttribute('data-go').split('/'));
    else UI.feedback();
  });
})();
