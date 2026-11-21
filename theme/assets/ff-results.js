/* ff-results.js: the numbers behind the Results page (FF.results), from the old web/pages/results.html, returning
   plain data instead of HTML: the Python Forms (Pages/Results + Items/SummaryCard, Bar, HistCol, TextAnswer,
   AnswerRow, FunnelStep and Dialogs/AnswerDetail) draw it. D = get_results(form_id).

   summary(D)              -> [card]   card = {num, title, sub, wide, empty, bigs: [{b, s}], bars: [{t, v, w, cls}],
                                        hist: [{label, h, cls, title}], nps: {d, p, g} | null, texts: [{text, small, href}],
                                        notes: [text], icon}
   funnel(D)               -> {steps: [{k, label, n, w, pct, lost, worst}], callout: {title, text} | null}
   table(D, partial, q)    -> {cols: [label], rows: [{id, cells: [text]}], count, more}
   detail(D, responseId)   -> {title, sub, fields: [{label, kind, text, href, src, files: [{name, href}]}], can_delete}
   csv(D)                  downloads every answer as a CSV file
   dupes(D)                -> {ids, email, same}: possible duplicate answers (same email, or same answers within 10 min)
   filterable(D)           -> [{id, label, opts: [{id, label}]}]: questions the "Only people who..." filter offers
   coach(D)                -> {waiting, good, rate, tips: [{num, title, text, href, cta}]}: the finish-rate coach */
(function () {
  'use strict';
  var FF = window.FF = window.FF || {};

  function pct(n, d) { return d ? Math.round(100 * n / d) : 0; }
  function median(xs) { var a = xs.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(a.length / 2); return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : 0; }
  function fmt(n) { return FF.fmtNum(n, Math.abs(n) < 10 ? 1 : 0); }
  function money(cents, cur) { return cents == null ? '' : (cents / 100).toLocaleString(undefined, { style: 'currency', currency: cur || 'USD' }); }
  function bars(rows, total, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return rows.map(function (r, i) {
      return { t: (r[2] ? '✓ ' : '') + r[0], v: r[1] + ' · ' + pct(r[1], total) + '%', w: +(100 * r[1] / max).toFixed(1),
        cls: r[2] ? 'ok' : (i === 0 && r[1] && !opts.noTop ? 'top' : '') };
    });
  }
  function card(num, title, sub) {
    return { num: num || '', title: title, sub: sub, wide: false, empty: false, bigs: [], bars: [], hist: [], nps: null, texts: [], notes: [], icon: '' };
  }

  function summaryCard(b, rs, num, quiz, D) {
    var vals = rs.map(function (r) { return r.answers[b.id]; }).filter(function (v) { return !FF.isEmpty(v); });
    var n = vals.length, t = b.type;
    var c = card(num, b.label || b.key, FF.TYPES[t].label + ' · ' + n + ' answered' + (rs.length ? ' · ' + pct(n, rs.length) + '%' : ''));
    if (!n) { c.empty = true; return c; }
    if (t === 'choice' || t === 'dropdown' || t === 'multi') {
      var cnt = {}; vals.forEach(function (v) { [].concat(v).forEach(function (x) { var k = typeof x === 'string' && x.indexOf('other:') === 0 ? 'other:' : x; cnt[k] = (cnt[k] || 0) + 1; }); });
      var rows = (b.options || []).map(function (o) { return [o.label, cnt[o.id] || 0, quiz && (b.correct || []).indexOf(o.id) >= 0]; });
      if (cnt['other:']) rows.push(['Other (typed)', cnt['other:']]);
      rows.sort(function (a, z) { return z[1] - a[1]; });
      if (rows.length > 12) rows = rows.filter(function (r) { return r[1]; }).slice(0, 12);
      if (quiz && b.correct && b.correct.length) {
        var right = vals.filter(function (v) { return t === 'multi' ? Array.isArray(v) && v.slice().sort().join() === b.correct.slice().sort().join() : b.correct.indexOf(v) >= 0; }).length;
        c.bigs.push({ b: pct(right, n) + '%', s: 'got it right' });
      }
      c.bars = bars(rows, n, { noTop: quiz });
    } else if (t === 'yesno') {
      var y = vals.filter(function (v) { return v === 'yes'; }).length;
      c.bigs.push({ b: pct(y, n) + '%', s: 'said yes' });
      c.bars = bars([['Yes', y], ['No', n - y]], n, { noTop: true });
    } else if (t === 'rating') {
      var mx = b.props.max || 5, avg = vals.reduce(function (s, v) { return s + v; }, 0) / n, cr = [];
      for (var k = mx; k >= 1; k--) cr.push([k + ' ★', vals.filter(function (v) { return v === k; }).length]);
      c.bigs.push({ b: avg.toFixed(1), s: 'out of ' + mx + ' on average' });
      c.bars = bars(cr, n, { noTop: true });
    } else if (t === 'scale') {
      var lo = b.props.min == null ? 0 : b.props.min, hi = b.props.max == null ? 10 : b.props.max, hist = [], hmax = 1;
      for (var s = lo; s <= hi; s++) { var hc = vals.filter(function (v) { return v === s; }).length; hist.push([s, hc]); hmax = Math.max(hmax, hc); }
      var nps = lo === 0 && hi === 10, mean = (vals.reduce(function (a, v) { return a + v; }, 0) / n).toFixed(1);
      if (nps) {
        var P = vals.filter(function (v) { return v >= 9; }).length, Dt = vals.filter(function (v) { return v <= 6; }).length, Pa = n - P - Dt, score = pct(P, n) - pct(Dt, n);
        c.bigs.push({ b: (score > 0 ? '+' : '') + score, s: 'Net Promoter Score · average ' + mean });
        c.nps = { d: pct(Dt, n), p: pct(Pa, n), g: pct(P, n) };
      } else c.bigs.push({ b: mean, s: 'average' });
      c.hist = hist.map(function (h) { return { label: String(h[0]), h: Math.round(100 * h[1] / hmax), cls: nps ? (h[0] >= 9 ? 'g' : h[0] >= 7 ? 'p' : 'd') : '', title: h[0] + ': ' + h[1] }; });
      c.wide = nps;
    } else if (t === 'number' || t === 'calc') {
      var xs = vals.map(Number).filter(function (x) { return !isNaN(x); }), sum = xs.reduce(function (a, v) { return a + v; }, 0), pre = t === 'calc' ? (b.props.prefix || '') : '';
      c.bigs.push({ b: pre + fmt(sum / xs.length), s: 'average' + (b.props.unit ? ' ' + b.props.unit : '') });
      c.bars = [['Lowest', Math.min.apply(null, xs)], ['Median', median(xs)], ['Highest', Math.max.apply(null, xs)], ['Total', sum]].map(function (r) {
        return { t: r[0], v: pre + fmt(r[1]), w: -1, cls: '' };
      });
    } else if (t === 'ranking') {
      var pos = {}; (b.options || []).forEach(function (o) { pos[o.id] = 0; });
      vals.forEach(function (v) { v.forEach(function (oid, j) { if (oid in pos) pos[oid] += j + 1; }); });
      var rk = (b.options || []).map(function (o) { return [o.label, pos[o.id] / n]; }).sort(function (a, z) { return a[1] - z[1]; });
      c.notes.push('Average position (1 = top):');
      c.bars = rk.map(function (r, j) { return { t: (j + 1) + '. ' + r[0], v: r[1].toFixed(1), w: -1, cls: j === 0 ? 'top' : '' }; });
    } else if (t === 'file') {
      var files = []; vals.forEach(function (v) { files = files.concat(v); });
      c.bigs.push({ b: String(files.length), s: 'files' });
      c.texts = files.slice(0, 8).map(function (f) { return { text: f.name, small: (f.size / 1048576).toFixed(1) + ' MB', href: D.file_base + '?key=' + encodeURIComponent(f.key) }; });
    } else if (t === 'signature' || t === 'consent') {
      c.bigs.push({ b: pct(n, rs.length) + '%', s: t === 'consent' ? 'agreed' : 'signed' });
    } else {
      var freq = {}; vals.forEach(function (v) { var k = String(v).trim().toLowerCase(); freq[k] = (freq[k] || 0) + 1; });
      var reps = Object.keys(freq).filter(function (k) { return freq[k] > 1; }).sort(function (a, z) { return freq[z] - freq[a]; });
      if (reps.length >= 2 && t === 'short') { c.bars = bars(reps.slice(0, 6).map(function (k) { return [k, freq[k]]; }), n); c.notes.push('Latest'); }
      if (t === 'date') { var ds = vals.slice().sort(); c.bigs.push({ b: UI.fmtDate(ds[0]) + ' – ' + UI.fmtDate(ds[ds.length - 1]), s: 'from the earliest to the latest', small: true }); }
      c.texts = rs.filter(function (r) { return !FF.isEmpty(r.answers[b.id]); }).slice(0, 8).map(function (r) {
        return { text: FF.display(b, r.answers[b.id]), small: UI.ago(r.submitted || r.started), href: '' };
      });
      c.wide = t === 'long';
    }
    return c;
  }

  function payCard(b, rs, num, D) {
    var selfPaid = rs.filter(function (r) { return r.answers[b.id] && r.answers[b.id].confirmed; }), checked = rs.filter(function (r) { return r.paid && r.paid.status === 'paid'; });
    var totals = {}; checked.forEach(function (r) { totals[r.paid.currency] = (totals[r.paid.currency] || 0) + (r.paid.amount || 0); });
    var um = (D.unmatched_payments || []).filter(function (p) { return p.status === 'paid'; });
    var c = card(num, b.label || 'Payment', 'Payment · Stripe');
    c.wide = true;
    c.bigs.push({ b: String(checked.length), s: 'paid, checked by Stripe' + (Object.keys(totals).length ? ' · ' + Object.keys(totals).map(function (k) { return money(totals[k], k); }).join(' + ') : '') });
    c.notes.push(UI.plural(selfPaid.length, 'person', 'people') + ' ticked “I\'ve paid”.' +
      (!checked.length && selfPaid.length ? ' Connect the Stripe webhook (Edit → Settings → Payments) to have Stripe confirm them; until then, match the reference in Stripe\'s payment details (client_reference_id).' : ''));
    if (um.length) c.notes.push(UI.plural(um.length, 'payment') + ' without an answer (paid, but never pressed Submit): ' + um.slice(0, 5).map(function (p) { return (p.email || 'unknown') + ' ' + money(p.amount, p.currency); }).join(', '));
    return c;
  }

  function summary(D) {
    var rs = D.responses, nums = {}, i = 0, quiz = D.form.settings.quiz, out = [];
    D.form.blocks.forEach(function (b) { if (FF.isAsked(b)) { i++; nums[b.id] = (i < 10 ? '0' : '') + i; } });
    if (quiz && rs.length) {
      var scores = rs.map(function (r) { return r.score || 0; }), mx = D.quiz_max || Math.max.apply(null, scores.concat([1])), hist = [], hm = 1;
      for (var s = 0; s <= mx; s++) { var c0 = scores.filter(function (x) { return x === s; }).length; hist.push([s, c0]); hm = Math.max(hm, c0); }
      var q = card('', 'Quiz scores', rs.length + ' scored');
      q.icon = 'trophy'; q.wide = true;
      q.bigs.push({ b: (scores.reduce(function (a, v) { return a + v; }, 0) / rs.length).toFixed(1), s: 'average out of ' + mx + ' · ' + pct(scores.filter(function (x) { return x === mx; }).length, rs.length) + '% perfect' });
      q.hist = hist.map(function (h) { return { label: String(h[0]), h: Math.round(100 * h[1] / hm), cls: '', title: h[0] + ' points: ' + h[1] }; });
      out.push(q);
    }
    D.form.blocks.filter(function (b) { return FF.isAsked(b) || b.type === 'calc'; }).forEach(function (b) {
      out.push(b.type === 'payment' ? payCard(b, rs, nums[b.id], D) : summaryCard(b, rs, nums[b.id] || '∑', quiz, D));
    });
    return out;
  }

  function funnel(D) {
    var fu = D.funnel, steps = [['', 'Opened the form', fu.views], ['', 'Started answering', fu.starts]], nums = 0;
    fu.steps.forEach(function (s) { nums++; steps.push([(nums < 10 ? 'Q0' : 'Q') + nums, s.label, s.reached]); });
    steps.push(['✓', 'Sent their answers', fu.complete]);
    var worst = -1, worstDrop = 0;
    for (var i = 2; i < steps.length; i++) { var d = steps[i - 1][2] - steps[i][2]; if (d > worstDrop) { worstDrop = d; worst = i; } }
    var max = Math.max(steps[0][2], 1);
    return {
      started: fu.starts,
      callout: worst > 0 && fu.starts ? { title: 'Most people leave at “' + steps[worst][1] + '”',
        text: worstDrop + ' of ' + fu.starts + ' who started (' + pct(worstDrop, fu.starts) + '%) stopped ' + (worst === steps.length - 1 ? 'right before sending.' : 'there.') + ' Try making it optional, shorter, or moving it later.' } : null,
      steps: steps.map(function (s, j) {
        var lost = j > 1 ? steps[j - 1][2] - s[2] : 0;
        return { k: s[0], label: s[1], n: s[2] + ' · ' + pct(s[2], max) + '%', w: +(100 * s[2] / max).toFixed(1), lost: lost > 0 ? '−' + lost : '', worst: j === worst };
      })
    };
  }

  function inputs(D) {
    return D.form.blocks.filter(function (b) { return FF.isInput(b) && b.type !== 'hidden'; }).concat(D.form.blocks.filter(function (b) { return b.type === 'hidden'; }));
  }
  function table(D, partial, query) {
    var list = partial ? D.partial : D.responses, cols = inputs(D).slice(0, 5), q = (query || '').toLowerCase(), quiz = D.form.settings.quiz && !partial;
    var rows = list.filter(function (r) {
      return !q || Object.keys(r.answers).some(function (k) { var b = D.form.blocks.filter(function (x) { return x.id === k; })[0]; return b && FF.display(b, r.answers[k]).toLowerCase().indexOf(q) >= 0; });
    });
    return {
      count: rows.length, more: rows.length > 500,
      cols: [partial ? 'Started' : 'Sent'].concat(quiz ? ['Score'] : []).concat(partial ? ['Got to'] : []).concat(cols.map(function (b) { return b.label || b.key; })),
      rows: rows.slice(0, 500).map(function (r) {
        return { id: r.id, cells: [UI.fmtDateTime(r.submitted || r.started)].concat(quiz ? [r.score == null ? '' : String(r.score)] : [])
          .concat(partial ? ['Q' + (r.reached + 1)] : []).concat(cols.map(function (b) { return FF.display(b, r.answers[b.id]); })) };
      })
    };
  }

  function detail(D, rid) {
    var r = D.responses.concat(D.partial).filter(function (x) { return x.id === rid; })[0];
    if (!r) return null;
    var fileUrl = function (f) { return D.file_base + '?key=' + encodeURIComponent(f.key); };
    return {
      title: 'Answer from ' + UI.fmtDateTime(r.submitted || r.started),
      sub: (r.status === 'partial' ? 'Unfinished · got to question ' + (r.reached + 1) : 'Took ' + (r.seconds ? Math.max(1, Math.round(r.seconds / 60)) + ' min' : '?') + (r.device ? ' on a ' + r.device : '')) + (r.score != null ? ' · score ' + r.score : ''),
      can_delete: D.role !== 'viewer',
      fields: D.form.blocks.filter(FF.isInput).map(function (b) {
        var v = r.answers[b.id], f = { label: b.label || b.key, kind: 'text', text: '', href: '', src: '', files: [] };
        if (FF.isEmpty(v)) { f.kind = 'empty'; f.text = '–'; }
        else if (b.type === 'signature') { if (v.kind === 'draw') { f.kind = 'sig'; f.src = v.data; } else { f.kind = 'typed'; f.text = v.name; } }
        else if (b.type === 'file') { f.kind = 'files'; f.files = v.map(function (x) { return { name: x.name, href: fileUrl(x) }; }); }
        else if (b.type === 'email') { f.kind = 'email'; f.text = v; f.href = 'mailto:' + v; }
        else if (b.type === 'payment') {
          if (r.paid && r.paid.status === 'paid') { f.kind = 'paid'; f.text = 'Paid, checked by Stripe · ' + money(r.paid.amount, r.paid.currency); }
          else { f.text = FF.display(b, v) + '\nStripe reference (client_reference_id): ' + (v.ref || ''); }
        } else f.text = FF.display(b, v);
        return f;
      })
    };
  }

  function csv(D) {
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

  /* Possible duplicates: answers that share an email address (any email question), or the very same answers sent
     twice within 10 minutes (a double click, a second tab). Returns {ids: [response id], email: n, same: n}. */
  function dupes(D) {
    var rs = D.responses || [], ids = {}, byMail = {}, emailN = 0, sameN = 0;
    var mails = D.form.blocks.filter(function (b) { return b.type === 'email'; }).map(function (b) { return b.id; });
    rs.forEach(function (r) {
      mails.forEach(function (bid) {
        var v = r.answers[bid];
        if (typeof v === 'string' && v.trim()) { var k = v.trim().toLowerCase(); (byMail[k] = byMail[k] || []).push(r.id); }
      });
    });
    Object.keys(byMail).forEach(function (k) {
      var list = byMail[k].filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (list.length > 1) list.forEach(function (x) { if (!ids[x]) { ids[x] = 1; emailN++; } });
    });
    var keyed = rs.map(function (r) {
      var keys = Object.keys(r.answers).sort(), sig = JSON.stringify(keys.map(function (k) { return [k, r.answers[k]]; }));
      return { id: r.id, sig: keys.length ? sig : '', at: Date.parse(r.submitted || r.started || '') || 0 };
    });
    for (var i = 0; i < keyed.length; i++) {
      for (var j = i + 1; j < keyed.length && j < i + 60; j++) {
        var a = keyed[i], b = keyed[j];
        if (a.sig && a.sig === b.sig && Math.abs(a.at - b.at) <= 600000) {
          [a.id, b.id].forEach(function (x) { if (!ids[x]) { ids[x] = 2; sameN++; } });
        }
      }
    }
    return { ids: Object.keys(ids), email: emailN, same: sameN };
  }

  /* Questions people can filter the results by: [{id, label, opts: [{id, label}]}] */
  function filterable(D) {
    return D.form.blocks.filter(function (b) { return ['choice', 'dropdown', 'multi', 'yesno', 'rating', 'scale'].indexOf(b.type) >= 0; }).map(function (b) {
      var o = [];
      if (b.type === 'yesno') o = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];
      else if (b.type === 'rating') { for (var k = (b.props.max || 5); k >= 1; k--) o.push({ id: String(k), label: k + ' ★' }); }
      else if (b.type === 'scale') { var lo = b.props.min == null ? 0 : b.props.min, hi = b.props.max == null ? 10 : b.props.max; for (var s = lo; s <= hi; s++) o.push({ id: String(s), label: String(s) }); }
      else { o = (b.options || []).map(function (x) { return { id: x.id, label: x.label }; }); if (b.props && b.props.other) o.push({ id: 'other:', label: 'Other (typed)' }); }
      return { id: b.id, label: (b.label || b.key || 'Question').slice(0, 80), opts: o };
    });
  }

  /* Finish-rate coach: up to 4 tips from this form's own numbers, each with a link into the editor.
     -> {waiting, good, rate, tips: [{num, title, text, href, cta}]} */
  function coach(D) {
    var fu = D.funnel, f = D.form, s = f.settings || {}, rs = D.responses || [], starts = fu.starts || 0;
    var out = { waiting: starts < 10, good: false, rate: starts ? pct(fu.complete, starts) : 0, tips: [] };
    if (out.waiting) return out;
    var build = '#edit/' + encodeURIComponent(f.id), design = build + '/design', settings = build + '/settings';
    var blocks = f.blocks, byId = {}; blocks.forEach(function (b) { byId[b.id] = b; });
    var asked = blocks.filter(FF.isAsked), tips = [];
    function tip(title, text, href, cta) { tips.push({ title: title, text: text, href: href, cta: cta || 'Fix it in the editor' }); }
    // where people leave (same reading as the funnel: the question they reached but didn't answer)
    var steps = fu.steps || [], worst = null;
    steps.forEach(function (st, i) {
      var before = i === 0 ? starts : steps[i - 1].reached, lost = Math.max(0, before - st.reached);
      if (!worst || lost > worst.lost) worst = { i: i, lost: lost, before: before, b: byId[st.id] };
    });
    var last = steps.length ? steps[steps.length - 1].reached : starts, lostEnd = Math.max(0, last - fu.complete);
    if (worst && worst.b && worst.lost >= Math.max(2, starts * 0.1) && worst.lost >= lostEnd) {
      var lbl = '“' + (worst.b.label || worst.b.key).slice(0, 60) + '”';
      if (worst.b.type === 'email' || worst.b.type === 'phone') {
        if (worst.i < steps.length / 2) tip('Ask for the ' + (worst.b.type === 'email' ? 'email' : 'phone number') + ' at the end',
          pct(worst.lost, starts) + '% of people stop at ' + lbl + '. People share contact details more easily once they\'ve answered the rest. Drag it to the end' + (worst.b.required ? ' or make it optional.' : '.'), build);
        else tip('Say why you need ' + lbl, pct(worst.lost, starts) + '% stop there. A short reason under the question ("only for the reminder") helps people trust it' + (worst.b.required ? ', or make it optional.' : '.'), build);
      } else if (worst.b.required) {
        tip('Make ' + lbl + ' optional', pct(worst.lost, starts) + '% of people who started stop there, and it\'s required. Optional questions lose fewer people: you still get most answers.', build);
      } else if (['long', 'file', 'signature', 'ranking'].indexOf(worst.b.type) >= 0) {
        tip('Lighten ' + lbl, pct(worst.lost, starts) + '% stop there. ' + ({ long: 'A long typed answer is hard work: try choices, or move it to the end.', file: 'Uploads are hard on phones: move it to the end or make it a link.', signature: 'Signing feels serious: explain why, or move it to the end.', ranking: 'Ranking takes effort: try "pick your top 2" instead.' }[worst.b.type]), build);
      } else tip('Look at ' + lbl, pct(worst.lost, starts) + '% stop there. Is it clear? Try shorter wording, fewer options, or moving it later.', build);
    } else if (lostEnd >= Math.max(2, starts * 0.1)) {
      tip('People stop right before sending', pct(lostEnd, starts) + '% answered everything but never pressed the button. Check the last page: a clear button text ("Send my RSVP") and nothing surprising at the end.', design, 'Change the button');
    }
    if (asked.length > 8 && out.rate < 60) tip('Cut it to the essentials', asked.length + ' questions and ' + out.rate + '% finish. Shorter forms finish more often (3-question forms beat 10-question ones by about 28%). Remove what you won\'t use, or split it in two.', build);
    var phones = rs.filter(function (r) { return r.device === 'phone'; }).length;
    if (rs.length >= 5 && phones / rs.length > 0.6 && s.layout !== 'focus') tip('Try one question at a time', pct(phones, rs.length) + '% answer on a phone. The one-question-at-a-time layout is easier with a thumb and shows clear progress.', design, 'Change the layout');
    var secs = rs.map(function (r) { return r.seconds; }).filter(function (x) { return x; }).sort(function (a, b) { return a - b; });
    if (secs.length >= 5) {
      var med = secs[Math.floor(secs.length / 2)] / 60, est = FF.minutes(blocks);
      if (med >= 2 && med > est * 2) tip('It takes longer than it says', 'People take about ' + Math.round(med) + ' min, but the form promises ~' + est + ' min. Shorten the questions that need typing, or say the real time in the description.', build);
    }
    var req = asked.filter(function (b) { return b.required; }).length;
    if (asked.length >= 4 && req / asked.length > 0.8) tip('Make fewer questions required', req + ' of ' + asked.length + ' questions are required. Keep the must-haves required and let people skip the rest.', build);
    if (s.progress === false && asked.length > 5) tip('Show the progress bar', 'With ' + asked.length + ' questions, people like to see how far they are.', design, 'Turn it on');
    out.tips = tips.slice(0, 4).map(function (t, i) { t.num = '0' + (i + 1); return t; });
    out.good = !out.tips.length && out.rate >= 60;
    return out;
  }

  /* The public form (#f/<slug>): wires the renderer to the server the way the old f page did. cfg = {preview, embed,
     params, onReport, onRestart} (the two callbacks are Python). Returns the renderer's controller. */
  function token(slug, fresh) {
    var k = 'fillfox.tok.' + slug, tok = null;
    try { tok = fresh ? null : localStorage.getItem(k); } catch (e) {}
    if (!tok) { tok = FF.uid(24); try { localStorage.setItem(k, tok); } catch (e) {} }
    return tok;
  }
  function hashParams() {
    var h = location.hash, i = h.indexOf('?'), out = {};
    if (i < 0) return out;
    h.slice(i + 1).split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('='); try { out[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) {}
    });
    return out;
  }
  function mountPublic(el, form, preview, embed, onReport) {
    var p = hashParams(), tok = token(form.slug);
    delete p.preview; delete p.embed;
    if (embed) document.documentElement.style.background = 'transparent';
    document.title = form.title + ' · Fillfox';
    return FF.render(el, form, {
      mode: preview ? 'preview' : 'live', embed: embed, params: p, token: preview ? 'preview' : tok,
      onPayOpen: function () { if (!preview) UI.apiQuiet('fill_progress', form.slug, tok, 0, null).catch(function () {}); },
      onProgress: function (reached, answers) { UI.apiQuiet('fill_progress', form.slug, tok, reached, answers).catch(function () {}); },
      upload: preview ? null : function (file, bid) { return UI.upload('upload_file', file, form.slug, tok, bid); },
      onSubmit: preview ? null : function (answers, meta) {
        return UI.apiQuiet('submit_response', form.slug, tok, answers, meta).then(function (r) { token(form.slug, true); return r; });
      },
      onRestart: function () { tok = token(form.slug, true); location.reload(); },
      onReport: function () { onReport(); }
    });
  }
  /* (preview / embed flags from the address: #f/<slug>?preview=1&embed=1) */
  function flags() { var p = hashParams(); return { preview: p.preview === '1', embed: p.embed === '1' }; }

  FF.results = { summary: summary, funnel: funnel, table: table, detail: detail, csv: csv, dupes: dupes, filterable: filterable, coach: coach };
  FF.publicForm = { mount: mountPublic, flags: flags };
})();
