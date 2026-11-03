# Fillfox

A free form builder: write a form like a document, share one link (or embed it), and see every answer plus exactly
where people stopped. Everything is free, including the things other builders charge for: drop-off per question,
unfinished answers, automatic deletion, teammates, quiz endings, answer copies by email. Made for small businesses,
clubs, teachers and makers. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/fillfox (branch `master`). Anvil pulls `master`.
- **Live:** https://fillfox.anvil.app

## What it does

**For people filling in a form** (`#f/<code>`, no account): classic pages or one question at a time (Enter to continue,
letter keys to pick, auto-advance), 20 question types, logic that hides questions and pages, live calculations,
answer piping (`{name}` in any text), quiz scores and endings by score, file uploads (10 MB), typed or drawn signatures,
answers kept on the device if the page reloads, accessible labels, errors and keyboard use, 6 languages
(EN, FR, ES, DE, PT, LV), pre-filled answers and hidden fields from the link (`#f/code?name=Ana&source=ig`), a
"Report this form" link and "Never submit passwords" on every form, embed mode that resizes its iframe.

**For creators (members):**
- **Forms dashboard** (`#forms`): your forms with answers, finish rate and a 14-day sparkline; forms shared with you;
  read-only example forms with realistic made-up results ("Use a copy").
- **New form:** blank, from 12 templates, from pasted questions (types guessed: email, phone, date, number, rating,
  NPS, yes/no, choices in `(A / B)` or `- option` lines, `*` = required, `---` = page), **from a Google Form's public
  link** (questions, choices with "Other", required marks, scales with labels, star ratings, grids as one question per
  row, sections, descriptions, dates, times, file uploads; images/videos skipped and listed), or a Fillfox JSON file.
- **Payments (Stripe Payment Links):** a Payment block with one Stripe link, or a link and amount per answer of an
  earlier choice ("price depends on the ticket"). The button opens Stripe with `client_reference_id` = the visit's
  reference (and the typed email pre-filled); the person ticks "I've paid". Optional verification: a Stripe webhook
  (Settings → Payments: endpoint `/_/api/stripe?form=<code>` + signing secret) marks answers "Paid, checked by Stripe"
  with the amount; results show totals, self-reported vs checked, and payments with no answer. Only Stripe-hosted
  links are accepted; Fillfox never sees card details.
- **Editor** (`#edit/<id>`): type a question + Enter (type guessed), `/` block menu with ready-made lists (countries,
  provinces, US states, languages, currencies, weekdays, months, agree scale), options with bulk paste, values for
  calculations and correct answers for quizzes, logic written as sentences, drag or Alt+↑/↓ to move, Ctrl+D duplicate,
  undo/redo (Ctrl+Z / Ctrl+Shift+Z), autosave, a **form check** (phishing words block publishing, missing labels,
  image alt text, broken formulas, rules pointing at later questions, all-required warning) and a time estimate.
- **Design:** layout, accent colour (text on buttons switches black/white for contrast), 4 fonts, cover, alignment,
  language, button text, progress bar, with a live preview.
- **Settings:** endings (with minimum scores in quiz mode, redirects), quiz mode + show score, close date, answer
  limit, closed message, one answer per device, keep unfinished answers, auto-delete after 30 days to 2 years,
  privacy contact (Law 25 / GDPR), email me each answer, send respondents a copy.
- **Share:** publish / stop / unpublish, link + QR code, embed code with auto-resize, pre-filled link builder,
  webhook (signed `X-Fillfox-Signature: sha256=...`, test button, delivery log), teammates by email, JSON export.
- **Results** (`#results/<id>`): KPIs (views, started, finished, finish rate, median minutes, phone share); a summary
  card per question (bars, NPS with promoters/detractors, star averages, number stats, ranking positions, latest text
  answers, files); quiz score histogram and % correct per question; every answer (search, open, delete); the drop-off
  funnel with "most people leave at…"; unfinished answers; CSV export (Excel-friendly, formula-injection safe);
  "Erase a person's answers" for privacy requests.
- **Templates** (`#templates`, public): try any template in place, then "Use this template" (visitors sign up first).

**Safety:** forms asking for passwords, PINs, card numbers, one-time codes, SSN/SIN, wallet phrases, "verify your
account" wording or "sign in to Microsoft/Google/bank…" can't be published; new accounts can publish 5 forms a day;
3 open reports pause a form; honeypot + minimum fill time + rate limits on answers; upload type allow-list.

**For everyone:** a landing page, sign-up with email and password or Google, a feedback form ("Send feedback" in the footer and
menu), and the Privacy & Terms page (footer link, `#legal`).

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview:** people, forms (live), answers, open reports, paused forms.
- **Reports:** reported forms with the reason; pause, restore, or dismiss the reports.
- **Forms:** search every form by title, code or owner email; pause or restore.
- **Feedback inbox:** New / Read / Done, private notes.
- **Users:** search, make admin, disable an account.
- **Demo data:** five example forms with ~190 made-up answers; remove or reload it.

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/fillfox`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. **Email** service: check it's there (new-answer emails and respondent copies).
4. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
5. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
6. **Publish** (Publish → public URL, or your own domain). Embedding is allowed (`allow_embedding: true`), so forms work inside other websites.

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | Loaded from a CDN | the QR code for a form's link on the Share tab (its own copy in assets/) |
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Forms (public page)](https://www.google.com/forms/about/) | Outside web service | imports a Google Form's questions from its public link |
| [Stripe Payment Links](https://stripe.com/payments/payment-links) | Outside web service | the Payment block, with optional webhook confirmation of each payment |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Fraunces, IBM Plex Mono, IBM Plex Sans, Space Grotesk |

**Built into the browser:** Canvas 2D, localStorage, Clipboard, File downloads (Blob), Web Animations.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil Google service, Anvil JS bridge (anvil.js), Anvil Users, Anvil HTTP, Anvil Email.

**Build and test tools (not shipped):** Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

See `.claude/skills/fillfox/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#forms, ?as=admin#admin, #f/democafe)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            the interface: core.js/core.css (shared engine + design tokens), app.js (header, footer), pages/*.html
  pages/_ff.html         FF: block types, logic, formulas, piping, paste parser, form check, lists (mirrors Logic.py)
  pages/_ffr.html        FF.render: the fill-in experience (public form, previews, templates)
  pages/_templates.html  the 12 templates
client_code/    Main.py (the only Anvil form: bridge to the server, uploads, sign-in), legal.py
server_code/    common.py, Accounts.py, Feedback.py, Admin.py (+ moderation), DemoData.py, legal_server.py,
                Logic.py (form model), Forms.py, Fill.py (public side, /file endpoint), Results.py
assets/         icon.svg + generated PNG icons, qrcode.min.js (QR codes, MIT) (served at _/theme/<name>)
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, preview/ (dev server, UI tests, screenshots), testing/
```
