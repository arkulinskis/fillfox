/* ff-editor.js: the whole form editor (Build, Design, Settings, Share) as one engine, unchanged from the JavaScript
   version (web/pages/edit.html) except that it is FF.editor(view, {args: [id, tab]}) -> {ready, destroy} instead of
   a page. Components/Editor mounts it; its server calls go through UI.api (ff-ui.js -> client_code/ff.py bridge). */
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
  FF.editor = function (view, ctx) {
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
  };
})();
