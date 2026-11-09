/* ff.js: the form model in the browser (window.FF), unchanged from the JavaScript version (web/pages/_ff.html):
   block types, show/hide logic, formulas, quiz score, piping, answer text, the paste parser, the form checker
   (FF.doctor) and option lists; then the templates (FF.TEMPLATES). server_code/Logic.py has the same rules in
   Python: keep the two in step. Python reaches it through client_code/ff.py. */
(function () {
  'use strict';
  var FF = window.FF = window.FF || {};
  var esc = UI.esc;

  /* (the extra icons now live in app-kit.js UI.ICONS, so icons.css has them too) */

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
