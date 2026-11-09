/* ffr.js: the form renderer (FF.render), unchanged from the JavaScript version (web/pages/_ffr.html). Draws a form
   for respondents (classic pages or one question at a time, logic, signatures, files, payments, endings).
   Used by Components/FormView (the public #f page, template try-outs) and the editor's preview. */
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
