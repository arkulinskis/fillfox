/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways, signed out (landing, templates + a template try-out, sign in / up, a missing
   form), then as a new member (the dashboard with the examples, an example's results in every tab + one answer, a new
   form made from pasted questions in all four editor tabs, its empty results, an example form filled in, profile),
   then as admin (every Admin tab). Python/JS errors are caught by ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const visible = (el) => el && el.getClientRects().length > 0;
  function button(re, root) { return $$((root || '') + ' button').find((b) => re.test(b.textContent) && visible(b)); }
  function check(hash, expect) {
    const main = $('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect + ' in: ' + text.slice(0, 160).replace(/\s+/g, ' '));
    if (w > vw + 1) {
      const wide = $$('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1 && !e.closest('.rs-table-wrap, .lp-demo'); })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      if (wide.length) problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(hash + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + hash);
  }
  async function open(hash, expect, landed) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && (landed ? landed() : location.hash === hash), hash, 30000);
    await sleep(900);
    check(hash, expect);
  }
  const editorReady = () => window.UI_EDITOR_READY === true && $('.ed-bar');
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (location.hash.indexOf('#forms') === 0 && window.UI_READY) return true;
      const msg = $('.au-card .anvil-role-msg-error');
      if (msg && visible(msg) && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && $$('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type($('.au-card input[type=email]'), email); type($('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash.indexOf('#forms') === 0 && window.UI_READY, 'signed in as ' + email, 30000);
  }
  async function signOut() {
    $('.anvil-role-avatar button').click();
    await sleep(300);
    button(/Sign out/, '.ui-menu').click();
    await until(() => {
      const a = $('.anvil-role-avatar button');
      return location.hash === '#landing' && window.UI_READY && (!a || !visible(a));
    }, 'signed out');
  }
  async function closeDialog() {
    const b = button(/^\s*(Close|Cancel)\s*$/, '.modal, .anvil-modal');
    if (b) b.click();
    await until(() => !$$('.modal, .anvil-modal').some(visible), 'dialog closed', 8000);
    await sleep(300);
  }
  try {
    // ---- signed out
    await open('#landing', /Forms people finish/);
    await open('#templates', /Start from a template/);
    $$('.tp-card')[0].click();
    try { await until(() => $('.tp-try .ffr') && $('.tp-try .ffr').innerText.length > 30, 'template try-out', 15000); log.push('ok   template try-out'); }
    catch (e) { bad.push('#templates: the try-out did not draw the form'); }
    await closeDialog();
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);
    await open('#f/no-such-form', /doesn't exist|isn't available/);

    // ---- a new member
    const ok = await signUp('Smoke Tester', 'smoke' + Date.now() + '@example.com', 'Ff-' + Math.random().toString(36).slice(2) + '-Kq7');
    if (!ok) throw new Error('sign-up failed');
    await open('#forms', /Your forms/);
    await until(() => $$('.fm-card').length, 'example forms', 20000);
    const demo = $$('.fm-card').find((c) => /Example/.test(c.innerText));
    const demoHref = demo && demo.querySelector('a.fm-title').getAttribute('href');
    const demoId = demoHref && demoHref.split('/')[1];
    const tryHref = demo && demo.querySelector('a[href^="#f/"]') && demo.querySelector('a[href^="#f/"]').getAttribute('href');
    if (!demoId) throw new Error('no example form on the dashboard');
    await open('#results/' + demoId, /views/);
    if (!$$('.rs-q').length) bad.push('#results: no summary cards');
    for (const t of ['answers', 'dropoff', 'unfinished']) await open('#results/' + demoId + '/' + t, /views/);
    await open('#results/' + demoId + '/answers', /answer/);
    const row = $('.rs-tr');
    if (row) {
      row.click();
      try { await until(() => $('.rs-detail') && visible($('.rs-detail')), 'answer detail', 10000); log.push('ok   answer detail'); }
      catch (e) { bad.push('#results: the answer did not open'); }
      await closeDialog();
    } else bad.push('#results/answers: no rows');
    if (tryHref) await open(tryHref, /Fillfox/);
    if (tryHref && !$('.ffr .ffr-head')) bad.push(tryHref + ': the form was not drawn');

    // a new form from pasted questions -> the editor
    await open('#forms', /Your forms/);
    button(/New form/).click();
    await until(() => $('.fm-new') && visible($('.fm-new')), 'new form dialog');
    button(/Paste questions/, '.fm-new').click();
    await until(() => $$('.fm-guess-row').length > 2, 'guessed questions');
    button(/Make the form/, '.fm-new').click();
    await until(() => /^#edit\/./.test(location.hash) && editorReady(), 'the editor', 30000);
    const formId = location.hash.split('/')[1];
    await sleep(800);
    check("#edit/" + formId, /Publish|Share/);
    if (!$$('.ed-b').length) bad.push('#edit: no blocks after pasting questions');
    for (const t of ['design', 'settings', 'share']) {
      window.UI_EDITOR_READY = false;
      await open("#edit/" + formId + "/" + t, /Publish|Share/, editorReady);
    }
    await open('#results/' + formId, /No answers yet/);
    await open('#profile', /Your name/);
    await open('#landing', /Your forms/);
    await signOut();

    // ---- admin (ADMIN_EMAILS in Accounts.py): sign up the first time, sign in after that
    const adminPw = 'Ff-smoke-adm-93Kx-7q';
    if (!(await signUp('Admin Tester', 'arkulinskis@gmail.com', adminPw))) await signIn('arkulinskis@gmail.com', adminPw);
    for (const t of ['overview', 'reports', 'forms', 'feedback', 'users', 'demo']) await open('#admin/' + t, /Admin/);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
