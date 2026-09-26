/* ==========================================================================
   MailPilot — Campaigns: list, editor (4 steps), live report
   ========================================================================== */
(function () {
  'use strict';
  var MP = window.MP, $ = MP.$, $$ = MP.$$, esc = MP.esc, icon = MP.icon;

  var SAMPLE = { name: 'Alex Morgan', first_name: 'Alex', last_name: 'Morgan', email: 'alex@example.com', unsubscribe_url: '#unsubscribe', company_address: 'Your Company · 123 Street · City', date: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }), year: String(new Date().getFullYear()) };

  function fillSample(str) {
    return String(str || '').replace(/\{\{\s*([a-z_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/gi, function (m, k, fb) {
      k = k.toLowerCase();
      if (!(k in SAMPLE)) return m;
      return SAMPLE[k] || fb || '';
    });
  }

  var STARTER = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>{{subject}}</title>',
    '  <style>',
    '    body { margin:0; padding:0; background:#f4f5fb; }',
    '    @media (max-width:620px) { .container { width:100% !important; } .px { padding-left:22px !important; padding-right:22px !important; } h1 { font-size:26px !important; } }',
    '  </style>',
    '</head>',
    '<body style="margin:0;padding:0;background:#f4f5fb;">',
    '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5fb;">',
    '    <tr><td align="center" style="padding:32px 12px;">',
    '      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">',
    '        <tr><td style="background:linear-gradient(135deg,#5b5bf0,#8b5cf6);background-color:#5b5bf0;padding:36px 40px;" class="px">',
    '          <div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.3px;">DaudDev</div>',
    '        </td></tr>',
    '        <tr><td class="px" style="padding:40px 40px 8px;">',
    '          <h1 style="margin:0 0 16px;font-size:30px;line-height:1.2;color:#14151f;">Hi {{first_name|there}}, big news! 🎉</h1>',
    '          <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#4b5064;">Write your message here. Keep it short, friendly and focused on one clear action you want the reader to take.</p>',
    '          <p style="margin:0 0 28px;font-size:16px;line-height:1.65;color:#4b5064;">Every link in this email is tracked automatically, so you will see who clicked what.</p>',
    '          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#5b5bf0;">',
    '            <a href="https://dauddev.com" style="display:inline-block;padding:15px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Check it out →</a>',
    '          </td></tr></table>',
    '        </td></tr>',
    '        <tr><td class="px" style="padding:32px 40px 40px;">',
    '          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5064;">Cheers,<br><b style="color:#14151f;">The DaudDev team</b></p>',
    '        </td></tr>',
    '      </table>',
    '      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">',
    '        <tr><td style="padding:22px 20px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8a8fa3;">',
    '          {{company_address}}<br>',
    '          You are receiving this because you subscribed to our updates.<br>',
    '          <a href="{{unsubscribe_url}}" style="color:#8a8fa3;text-decoration:underline;">Unsubscribe</a>',
    '        </td></tr>',
    '      </table>',
    '    </td></tr>',
    '  </table>',
    '</body>',
    '</html>'
  ].join('\n');

  var TAGS = [
    { tag: '{{first_name|there}}', label: 'First name (fallback "there")' },
    { tag: '{{name}}', label: 'Full name' },
    { tag: '{{email}}', label: 'Email address' },
    { tag: '{{unsubscribe_url}}', label: 'Unsubscribe link URL' },
    { tag: '{{company_address}}', label: 'Company postal address' },
    { tag: '{{date}}', label: 'Today\'s date' },
    { tag: '{{year}}', label: 'Current year' }
  ];

  /* ------------------------------------------------------------ CodeMirror (lazy, from CDN) */
  var cmPromise = null;
  MP.loadCodeMirror = function () {
    if (window.CodeMirror) return Promise.resolve(window.CodeMirror);
    if (cmPromise) return cmPromise;
    var base = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
    function css(href) {
      return new Promise(function (res) {
        var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res;
        document.head.appendChild(l);
      });
    }
    function js(src) {
      return new Promise(function (res, rej) {
        var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    var chain = css(base + 'codemirror.min.css').then(function () { return js(base + 'codemirror.min.js'); })
      .then(function () {
        return Promise.all(['mode/xml/xml.min.js', 'mode/javascript/javascript.min.js', 'mode/css/css.min.js', 'addon/fold/xml-fold.min.js', 'addon/selection/active-line.min.js']
          .map(function (p) { return js(base + p); }));
      })
      .then(function () { return Promise.all([js(base + 'mode/htmlmixed/htmlmixed.min.js'), js(base + 'addon/edit/closetag.min.js')]); })
      .then(function () { return window.CodeMirror; });
    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 9000); });
    cmPromise = Promise.race([chain, timeout]).catch(function (e) { cmPromise = null; throw e; });
    return cmPromise;
  };

  /* ------------------------------------------------------------ list */
  MP.route('/campaigns', function (el, params, ctx) {
    MP.setCrumbs([{ label: 'Campaigns' }]);
    el.innerHTML = MP.skeleton(5);
    var filter = MP.store.get('camp-filter', 'all');
    var timer = null, data = null;

    function groups(list) {
      return {
        all: list,
        active: list.filter(function (c) { return ['sending', 'scheduled', 'paused'].indexOf(c.status) >= 0; }),
        draft: list.filter(function (c) { return c.status === 'draft'; }),
        done: list.filter(function (c) { return c.status === 'completed' || c.status === 'cancelled'; })
      };
    }

    function card(c) {
      var s = c.stats;
      var isDraft = c.status === 'draft';
      var live = c.status === 'sending';
      var meta = isDraft ? 'Edited ' + MP.ago(c.updated_at)
        : c.status === 'scheduled' ? 'Scheduled for ' + MP.date(c.scheduled_at)
          : (c.completed_at ? 'Finished ' + MP.date(c.completed_at) : 'Started ' + MP.ago(c.started_at));
      return '<div class="card hover camp" data-id="' + c.id + '" data-status="' + c.status + '">' +
        '<div style="min-width:0"><div class="c-name"><span class="trunc">' + esc(c.name) + '</span>' + MP.badge(c.status) + '</div>' +
        '<div class="c-sub trunc">' + (c.subject ? esc(c.subject) : '<i>No subject yet</i>') + '</div>' +
        '<div class="c-sub">' + icon('clock', 'ico') .replace('class="ico"', 'class="ico" style="width:13px;height:13px;vertical-align:-2px"') + ' ' + meta + '</div></div>' +
        (isDraft
          ? '<div class="hint">Draft — continue editing to choose your audience and launch.</div>'
          : '<div><div class="c-stats">' +
            '<div class="c-stat"><b>' + MP.num(s.total) + '</b>Recipients</div>' +
            '<div class="c-stat"><b>' + MP.num(s.sent) + '</b>Delivered</div>' +
            '<div class="c-stat"><b>' + MP.pct(s.open_rate) + '</b>Opened</div>' +
            '<div class="c-stat"><b>' + MP.num(s.bounced + s.failed + s.invalid) + '</b>Problems</div></div>' +
            (c.status !== 'completed' && c.status !== 'cancelled' ? '<div class="progress ' + (live ? 'live' : '') + '"><i style="width:' + s.progress + '%"></i></div>' : '') + '</div>') +
        '<div class="row"><button class="btn ghost icon sm" data-menu="' + c.id + '">' + icon('more') + '</button></div></div>';
    }

    function draw() {
      var g = groups(data.campaigns);
      var list = g[filter] || g.all;
      el.innerHTML =
        '<div class="page-head"><div><h1>Campaigns</h1><p>Create HTML campaigns, send them to your Email Houses and track every result.</p></div>' +
        '<div class="actions"><button class="btn primary" id="newC">' + icon('plus') + '<span>New campaign</span></button></div></div>' +
        '<div class="tabs mb-16" id="ctabs">' +
        [['all', 'All'], ['active', 'Active'], ['draft', 'Drafts'], ['done', 'Finished']].map(function (t) {
          return '<button data-tab="' + t[0] + '" class="' + (filter === t[0] ? 'on' : '') + '">' + t[1] + ' <span class="n">' + g[t[0]].length + '</span></button>';
        }).join('') + '</div>' +
        '<div class="camp-list stagger" id="clist">' +
        (list.length ? list.map(card).join('') : '<div class="card">' + (data.campaigns.length
          ? MP.empty('filter', 'Nothing here', 'No campaigns match this filter.')
          : MP.empty('send', 'Create your first campaign', 'Write or paste your HTML email, choose the Email Houses to send to and launch. You will get live stats for every email.', '<button class="btn primary" id="newC2">' + icon('plus') + '<span>New campaign</span></button>')) + '</div>') +
        '</div>';
      MP.tabs($('#ctabs', el), function (v) { filter = v; MP.store.set('camp-filter', v); draw(); });
      $('#newC', el).addEventListener('click', function () { MP.go('/campaigns/new'); });
      var n2 = $('#newC2', el);
      if (n2) n2.addEventListener('click', function () { MP.go('/campaigns/new'); });
      $('#clist', el).addEventListener('click', function (e) {
        var m = e.target.closest('[data-menu]');
        var cardEl = e.target.closest('.camp');
        if (!cardEl) return;
        var id = +cardEl.getAttribute('data-id');
        var status = cardEl.getAttribute('data-status');
        if (m) {
          e.stopPropagation();
          MP.dropdown(m, [
            status === 'draft' ? { label: 'Edit', icon: 'edit', onClick: function () { MP.go('/campaigns/' + id + '/edit'); } }
              : { label: 'View report', icon: 'chart', onClick: function () { MP.go('/campaigns/' + id); } },
            { label: 'Duplicate', icon: 'copy', onClick: function () { duplicate(id); } },
            '-',
            { label: 'Delete', icon: 'trash', danger: true, onClick: function () { remove(id); } }
          ]);
          return;
        }
        MP.go('/campaigns/' + id + (status === 'draft' ? '/edit' : ''));
      });
    }

    function duplicate(id) {
      MP.api('campaign.duplicate', { id: id }).then(function (r) {
        MP.toast('Campaign duplicated — opening the copy');
        MP.go('/campaigns/' + r.id + '/edit');
      }).catch(function (e) { MP.toast(e.message, 'error'); });
    }
    function remove(id) {
      var c = data.campaigns.filter(function (x) { return x.id === id; })[0];
      MP.confirm({ title: 'Delete this campaign?', text: '<b>' + esc(c.name) + '</b> and all of its statistics will be permanently deleted.', danger: true, confirmLabel: 'Delete campaign' })
        .then(function (ok) {
          if (!ok) return;
          var node = $('.camp[data-id="' + id + '"]', el);
          if (node) { node.style.transition = 'all .35s var(--ease)'; node.style.opacity = '0'; node.style.transform = 'translateX(30px)'; }
          return MP.api('campaign.delete', { id: id }).then(function () { MP.toast('Campaign deleted'); return load(); });
        }).catch(function (e) { MP.toast(e.message, 'error'); });
    }

    function load() {
      return MP.api('campaigns.list', {}).then(function (r) {
        if (!ctx.alive()) return;
        var first = !data;
        data = r;
        if (first) draw();
        else {
          // quiet refresh: update progress bars and numbers without re-animating everything
          var html = $('#clist', el);
          draw();
          $$('.stagger > *', el).forEach(function (n) { n.style.animation = 'none'; });
          void html;
        }
        clearTimeout(timer);
        if (r.campaigns.some(function (c) { return c.status === 'sending'; })) timer = setTimeout(load, 8000);
      });
    }
    return load().then(function () { return function () { clearTimeout(timer); }; });
  }, 'campaigns');

  /* ------------------------------------------------------------ editor */
  function editor(el, params, ctx) {
    var isNew = !params.id;
    MP.setCrumbs([{ label: 'Campaigns', href: '/campaigns' }, { label: isNew ? 'New campaign' : 'Edit campaign' }]);
    el.innerHTML = MP.skeleton(4);
    var c, houses = [], dirty = false, saving = null, step = 0, cm = null, previewTimer = null, autosaveTimer = null;
    var testSent = MP.store.get('test-sent-' + (params.id || 'new'), false);
    var device = MP.store.get('editor-device', 'desktop');
    var mode = MP.store.get('editor-mode', 'split');
    var STEPS = ['Details', 'Audience', 'Design', 'Review & launch'];

    var loads = [MP.api('houses.list', {})];
    if (!isNew) loads.push(MP.api('campaign.get', { id: params.id }));
    return Promise.all(loads).then(function (res) {
      if (!ctx.alive()) return;
      houses = res[0].houses;
      if (isNew) {
        c = { id: 0, name: 'Untitled campaign', subject: '', preheader: '', from_name: MP.state.fromName || '', from_email: '', reply_to: '', html: '', text_body: '', track_opens: true, track_clicks: true, list_ids: [], status: 'draft' };
        if (houses.length === 1) c.list_ids = [houses[0].id];
      } else {
        c = res[1].campaign;
        if (c.status !== 'draft') { MP.go('/campaigns/' + c.id); return; }
      }
      build();
      return function cleanup() {
        clearTimeout(previewTimer);
        clearTimeout(autosaveTimer);
        if (dirty) return save(true);
      };
    });

    function payload() {
      return {
        id: c.id, name: c.name, subject: c.subject, preheader: c.preheader, from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to,
        html: c.html, text_body: c.text_body, track_opens: c.track_opens, track_clicks: c.track_clicks, list_ids: c.list_ids
      };
    }

    function setSaveState(s) {
      var n = $('#saveState', el);
      if (!n) return;
      if (s === 'saving') n.innerHTML = '<span class="spinner" style="width:13px;height:13px;border-width:2px;vertical-align:-2px"></span> Saving…';
      else if (s === 'dirty') n.innerHTML = '<span class="faint">Unsaved changes</span>';
      else if (s === 'saved') n.innerHTML = '<span style="color:var(--success)">' + icon('check', 'ico').replace('class="ico"', 'class="ico" style="width:14px;height:14px;vertical-align:-2px"') + ' Saved</span>';
      else n.innerHTML = '';
    }

    function markDirty() {
      dirty = true;
      setSaveState('dirty');
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(function () { save(true); }, 2500);
    }

    function save(quiet) {
      if (saving) return saving.then(function () { return dirty ? save(quiet) : null; });
      clearTimeout(autosaveTimer);
      setSaveState('saving');
      dirty = false;
      saving = MP.api('campaign.save', payload()).then(function (r) {
        var wasNew = !c.id;
        c.id = r.campaign.id;
        if (wasNew && ctx.alive()) {
          MP.replacePath('/campaigns/' + c.id + '/edit');
          MP.store.set('test-sent-' + c.id, testSent);
        }
        if (ctx.alive()) setSaveState(dirty ? 'dirty' : 'saved');
        if (!quiet) MP.toast('Draft saved');
        return r;
      }).catch(function (e) {
        dirty = true;
        if (ctx.alive()) setSaveState('dirty');
        MP.toast(e.message, 'error');
        throw e;
      }).finally(function () { saving = null; });
      return saving;
    }

    function build() {
      el.innerHTML =
        '<a class="back" href="#/campaigns">' + icon('left') + '<span>All campaigns</span></a>' +
        '<div class="row wrap" style="margin-bottom:6px"><div style="flex:1;min-width:260px"><input class="name-input" id="cName" value="' + esc(c.name) + '" maxlength="190" aria-label="Campaign name"></div>' +
        '<span class="hint" id="saveState"></span>' +
        '<button class="btn" id="testBtn">' + icon('mail') + '<span>Send test</span></button>' +
        '<button class="btn" id="saveBtn">' + icon('check') + '<span>Save draft</span></button></div>' +
        '<div class="stepper" id="stepper"></div>' +
        '<div class="panes" id="pane"></div>' +
        '<div class="row mt-24" id="stepNav"></div>';
      $('#cName', el).addEventListener('input', function () { c.name = this.value; markDirty(); });
      $('#saveBtn', el).addEventListener('click', function () { MP.busy(this, function () { return save(false); }); });
      $('#testBtn', el).addEventListener('click', openTest);
      goStep(0, true);
    }

    function goStep(n, initial) {
      var dir = n >= step ? '' : 'from-left';
      step = n;
      $('#stepper', el).innerHTML = STEPS.map(function (s, i) {
        return (i ? '<span class="step-line"></span>' : '') + '<button class="step ' + (i === step ? 'on' : i < step ? 'done' : '') + '" data-step="' + i + '"><span class="n">' + (i < step ? icon('check', 'ico').replace('class="ico"', 'class="ico" style="width:14px;height:14px"') : i + 1) + '</span>' + s + '</button>';
      }).join('');
      $$('.step', el).forEach(function (b) { b.addEventListener('click', function () { goStep(+b.getAttribute('data-step')); }); });
      var pane = $('#pane', el);
      if (cm) { cm = null; }
      pane.innerHTML = '<div class="pane ' + (initial ? '' : dir) + '"></div>';
      var p = pane.firstElementChild;
      [paneDetails, paneAudience, paneDesign, paneReview][step](p);
      var nav = $('#stepNav', el);
      nav.innerHTML = (step > 0 ? '<button class="btn" id="prevStep">' + icon('left') + '<span>' + STEPS[step - 1] + '</span></button>' : '') +
        '<span class="spacer"></span>' +
        (step < 3 ? '<button class="btn primary" id="nextStep"><span>Next: ' + STEPS[step + 1] + '</span>' + icon('right') + '</button>' : '');
      if ($('#prevStep', el)) $('#prevStep', el).addEventListener('click', function () { goStep(step - 1); });
      if ($('#nextStep', el)) $('#nextStep', el).addEventListener('click', function () { goStep(step + 1); });
      if (!initial) window.scrollTo({ top: 0, behavior: 'smooth' });
      if (!initial && dirty) save(true);
    }

    /* ---------- step 1: details */
    function paneDetails(p) {
      p.innerHTML =
        '<div class="grid-2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start">' +
        '<div class="card pad"><div class="form-grid">' +
        '<div class="field full"><label>Subject line <span class="counter" id="subjCount"></span></label><input class="input big" name="subject" value="' + esc(c.subject) + '" maxlength="255" placeholder="e.g. Our biggest update of the year 🎉">' +
        '<span class="hint">Tip: 30–60 characters works best. Personalise it with {{first_name|there}}.</span></div>' +
        '<div class="field full"><label>Preview text <span class="counter" id="preCount"></span></label><input class="input" name="preheader" value="' + esc(c.preheader) + '" maxlength="255" placeholder="The short summary shown after the subject in the inbox">' +
        '</div>' +
        '<div class="field"><label>From name</label><input class="input" name="from_name" value="' + esc(c.from_name) + '" placeholder="' + esc(MP.state.fromName || 'DaudDev') + '"></div>' +
        '<div class="field"><label>From email</label><input class="input" name="from_email" value="' + esc(c.from_email) + '" placeholder="' + esc(MP.state.fromEmail || 'marketing@dauddev.com') + '"><span class="hint">Leave empty to use ' + esc(MP.state.fromEmail || 'the default sender') + '.</span></div>' +
        '<div class="field full"><label>Reply-to address <span class="faint" style="font-weight:500">(optional)</span></label><input class="input" name="reply_to" value="' + esc(c.reply_to) + '" placeholder="Where replies should go"></div>' +
        '</div></div>' +
        '<div><div class="section-title" style="margin-top:0">Inbox preview</div><div class="inbox-preview"><div class="ip-bar"><i></i><i></i><i></i></div>' +
        '<div class="ip-row ghost"><div class="av" style="background:#cbd5e1">A</div><div class="ip-main"><div class="ip-from">Another sender<span>9:12</span></div><div class="ip-subj">Weekly digest</div><div class="ip-pre trunc">Some other email in the inbox…</div></div></div>' +
        '<div class="ip-row" style="background:var(--primary-soft)"><div class="av" id="ipAv"></div><div class="ip-main"><div class="ip-from"><span id="ipFrom" style="margin:0;color:var(--text);font-weight:750;font-size:13.5px"></span><span>now</span></div>' +
        '<div class="ip-subj trunc" id="ipSubj"></div><div class="ip-pre trunc" id="ipPre"></div></div></div>' +
        '<div class="ip-row ghost"><div class="av" style="background:#fda4af">N</div><div class="ip-main"><div class="ip-from">Newsletter<span>Yesterday</span></div><div class="ip-subj">Your receipt</div><div class="ip-pre trunc">Thanks for your order…</div></div></div>' +
        '</div></div></div>';
      function preview() {
        var from = c.from_name || MP.state.fromName || 'DaudDev';
        $('#ipFrom', p).textContent = from;
        $('#ipAv', p).textContent = MP.initials(from).slice(0, 1);
        $('#ipSubj', p).textContent = fillSample(c.subject) || 'Your subject line';
        $('#ipPre', p).textContent = fillSample(c.preheader) || 'Your preview text appears here…';
        var sl = (c.subject || '').length;
        var sc = $('#subjCount', p);
        sc.textContent = sl + ' chars';
        sc.classList.toggle('warn', sl > 70);
        $('#preCount', p).textContent = (c.preheader || '').length + ' chars';
      }
      $$('input', p).forEach(function (i) {
        i.addEventListener('input', function () { c[i.name] = i.value; markDirty(); preview(); });
      });
      preview();
      setTimeout(function () { var s = $('input[name=subject]', p); if (!c.subject && s) s.focus(); }, 300);
    }

    /* ---------- step 2: audience */
    function paneAudience(p) {
      if (!houses.length) {
        p.innerHTML = '<div class="card">' + MP.empty('house', 'You have no Email Houses yet', 'An Email House is a list of email addresses. Create one and import your contacts, then come back here.',
          '<button class="btn primary" id="goHouses">' + icon('plus') + '<span>Create an Email House</span></button>') + '</div>';
        $('#goHouses', p).addEventListener('click', function () { save(true).then(function () { MP.go('/houses'); }); });
        return;
      }
      p.innerHTML = '<div class="card pad"><div class="row" style="margin-bottom:16px"><div><h3 style="font-size:17px">Who should receive this campaign?</h3>' +
        '<div class="hint">Pick one or more Email Houses. Duplicates across houses are only emailed once, and unsubscribed / bounced addresses are skipped automatically.</div></div>' +
        '<span class="spacer"></span><button class="btn ghost sm" id="selAll">Select all</button></div>' +
        '<div class="house-pick stagger">' + houses.map(function (h) {
          var on = c.list_ids.indexOf(h.id) >= 0;
          return '<div class="house-opt hc-' + esc(h.color) + (on ? ' on' : '') + '" data-id="' + h.id + '"><input type="checkbox" class="check"' + (on ? ' checked' : '') + ' tabindex="-1">' +
            '<div style="min-width:0"><b class="row" style="gap:8px"><span class="dot-c"></span><span class="trunc">' + esc(h.name) + '</span></b>' +
            '<span>' + MP.num(h.active) + ' active · ' + MP.num(h.total) + ' total</span></div></div>';
        }).join('') + '</div>' +
        '<div class="audience-sum" id="audSum"><div><div class="big" id="audN" data-count="0">0</div><div class="lbl">unique recipients will get this email</div></div>' +
        '<span class="spacer"></span><div style="text-align:right"><div style="font-weight:700" id="audSkip"></div><div class="lbl" id="audEta"></div></div></div></div>';
      var refresh = MP.debounce(function () {
        MP.api('campaign.audience', { list_ids: c.list_ids }).then(function (r) {
          if (!ctx.alive()) return;
          var n = $('#audN', p);
          if (!n) return;
          n.setAttribute('data-count', r.audience.sendable);
          MP.countUp(p);
          $('#audSkip', p).textContent = r.audience.skipped ? MP.num(r.audience.skipped) + ' will be skipped' : '';
          var lim = MP.state.engine && MP.state.engine.hourly_limit;
          $('#audEta', p).textContent = r.audience.sendable && lim ? '≈ ' + MP.duration(r.audience.sendable / lim * 3600) + ' to send at ' + MP.num(lim) + '/hour' : (r.audience.skipped ? 'unsubscribed / bounced / invalid' : '');
        }).catch(function () {});
      }, 250);
      $$('.house-opt', p).forEach(function (o) {
        o.addEventListener('click', function () {
          var id = +o.getAttribute('data-id');
          var i = c.list_ids.indexOf(id);
          if (i >= 0) c.list_ids.splice(i, 1); else c.list_ids.push(id);
          o.classList.toggle('on', i < 0);
          $('input', o).checked = i < 0;
          markDirty();
          refresh();
        });
      });
      $('#selAll', p).addEventListener('click', function () {
        var all = c.list_ids.length !== houses.length;
        c.list_ids = all ? houses.map(function (h) { return h.id; }) : [];
        $$('.house-opt', p).forEach(function (o) { o.classList.toggle('on', all); $('input', o).checked = all; });
        markDirty();
        refresh();
      });
      refresh();
    }

    /* ---------- step 3: design */
    function paneDesign(p) {
      p.innerHTML =
        '<div class="card" id="edCard"><div class="editor-bar">' +
        '<div class="btn-group" id="modeGrp"><button data-mode="code">' + icon('code') + 'Code</button><button data-mode="split">' + icon('split') + 'Split</button><button data-mode="preview">' + icon('eye') + 'Preview</button></div>' +
        '<div class="btn-group" id="devGrp"><button data-dev="desktop">' + icon('monitor') + '</button><button data-dev="mobile">' + icon('phone') + '</button></div>' +
        '<span class="spacer"></span>' +
        '<button class="btn sm" id="tagBtn">' + icon('tag') + '<span>Insert tag</span></button>' +
        '<button class="btn sm" id="tplBtn">' + icon('sparkles') + '<span>Template</span></button>' +
        '<button class="btn sm" id="impBtn">' + icon('upload') + '<span>Import .html</span></button>' +
        '<input type="file" id="impFile" accept=".html,.htm,text/html" class="hidden">' +
        '<button class="btn sm icon" id="fsBtn" data-tip="Full screen">' + icon('maximize') + '</button>' +
        '</div>' +
        '<div class="editor-split mode-' + mode + '" id="split"><div class="editor-code" id="codeBox"><textarea class="raw" id="rawCode" spellcheck="false" placeholder="Paste or write your HTML email here…"></textarea></div>' +
        '<div class="editor-preview ' + device + '" id="prevBox"><div class="frame"><iframe id="prevFrame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title="Email preview"></iframe></div></div></div></div>' +
        '<div class="card pad mt-16"><div class="row"><div><h3 style="font-size:15.5px">Plain-text version</h3><div class="hint">Shown by email apps that cannot display HTML. Leave empty to generate it automatically from your HTML.</div></div>' +
        '<span class="spacer"></span><button class="btn sm ghost" id="txtToggle">' + (c.text_body ? 'Hide' : 'Write my own') + '</button></div>' +
        '<textarea class="textarea code mt-16' + (c.text_body ? '' : ' hidden') + '" id="txtBody" rows="8" placeholder="Plain text content…">' + esc(c.text_body) + '</textarea></div>';

      var raw = $('#rawCode', p);
      raw.value = c.html;
      var frame = $('#prevFrame', p);

      function setHtml(v, fromEditor) {
        c.html = v;
        markDirty();
        if (!fromEditor) {
          if (cm) cm.setValue(v); else raw.value = v;
        }
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 250);
      }
      function updatePreview() {
        var html = c.html.trim() ? fillSample(c.html) : '<div style="font-family:Inter,Arial,sans-serif;color:#8b90a5;display:flex;height:90vh;align-items:center;justify-content:center;text-align:center;padding:20px"><div><div style="font-size:42px">✉️</div><p style="font-size:15px;margin:10px 0 0">Your email preview will appear here.<br>Paste your HTML, import a file or start from a template.</p></div></div>';
        if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
        else html = '<base target="_blank">' + html;
        frame.srcdoc = html;
      }
      raw.addEventListener('input', function () { setHtml(raw.value, true); });
      raw.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          var s = raw.selectionStart;
          raw.value = raw.value.slice(0, s) + '  ' + raw.value.slice(raw.selectionEnd);
          raw.selectionStart = raw.selectionEnd = s + 2;
          setHtml(raw.value, true);
        }
      });
      updatePreview();

      // Upgrade the textarea to CodeMirror when the CDN is reachable.
      MP.loadCodeMirror().then(function (CodeMirror) {
        if (!ctx.alive() || !document.body.contains(raw)) return;
        cm = CodeMirror.fromTextArea(raw, {
          mode: 'htmlmixed', lineNumbers: true, lineWrapping: true, tabSize: 2, indentUnit: 2,
          autoCloseTags: true, styleActiveLine: true, viewportMargin: 50
        });
        cm.on('change', function () { setHtml(cm.getValue(), true); });
        setTimeout(function () { cm.refresh(); }, 50);
      }).catch(function () { /* textarea fallback stays */ });

      function insert(text) {
        if (cm) { cm.replaceSelection(text); cm.focus(); return; }
        var s = raw.selectionStart;
        raw.value = raw.value.slice(0, s) + text + raw.value.slice(raw.selectionEnd);
        raw.selectionStart = raw.selectionEnd = s + text.length;
        raw.focus();
        setHtml(raw.value, true);
      }

      function setGroup(grp, attr, val) {
        $$('button', grp).forEach(function (b) { b.classList.toggle('on', b.getAttribute(attr) === val); });
      }
      setGroup($('#modeGrp', p), 'data-mode', mode);
      setGroup($('#devGrp', p), 'data-dev', device);
      $('#modeGrp', p).addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        mode = b.getAttribute('data-mode');
        MP.store.set('editor-mode', mode);
        setGroup(this, 'data-mode', mode);
        $('#split', p).className = 'editor-split mode-' + mode;
        setTimeout(function () { if (cm) cm.refresh(); }, 480);
      });
      $('#devGrp', p).addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        device = b.getAttribute('data-dev');
        MP.store.set('editor-device', device);
        setGroup(this, 'data-dev', device);
        $('#prevBox', p).className = 'editor-preview ' + device;
      });
      $('#tagBtn', p).addEventListener('click', function () {
        MP.dropdown(this, [{ header: 'Personalisation' }].concat(TAGS.map(function (t) {
          return { label: t.label, icon: 'tag', onClick: function () { insert(t.tag); } };
        })));
      });
      $('#tplBtn', p).addEventListener('click', function () {
        var go = function () { setHtml(STARTER); MP.toast('Starter template inserted — make it yours!'); };
        if (c.html.trim()) {
          MP.confirm({ title: 'Replace your HTML?', text: 'The starter template will replace the current content of the editor.', confirmLabel: 'Replace', danger: true })
            .then(function (ok) { if (ok) go(); });
        } else go();
      });
      var file = $('#impFile', p);
      $('#impBtn', p).addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () { setHtml(String(reader.result)); MP.toast('Imported ' + f.name); };
        reader.readAsText(f);
        file.value = '';
      });
      $('#fsBtn', p).addEventListener('click', function () {
        var card = $('#edCard', p);
        var on = !card.classList.contains('editor-fs');
        card.classList.toggle('editor-fs', on);
        this.innerHTML = icon(on ? 'minimize' : 'maximize');
        document.body.style.overflow = on ? 'hidden' : '';
        setTimeout(function () { if (cm) cm.refresh(); }, 60);
      });
      $('#txtToggle', p).addEventListener('click', function () {
        var t = $('#txtBody', p);
        var show = t.classList.contains('hidden');
        t.classList.toggle('hidden', !show);
        this.textContent = show ? 'Hide' : 'Write my own';
        if (show) t.focus();
      });
      $('#txtBody', p).addEventListener('input', function () { c.text_body = this.value; markDirty(); });
    }

    /* ---------- step 4: review */
    function paneReview(p) {
      p.innerHTML = MP.skeleton(3);
      var go = c.id && !dirty ? Promise.resolve() : save(true);
      go.then(function () { return MP.api('campaign.get', { id: c.id }); }).then(function (r) {
        if (!ctx.alive()) return;
        var aud = r.audience, problems = r.problems;
        var eng = MP.state.engine || {};
        var hasUnsub = /\{\{\s*unsubscribe_url/i.test(c.html);
        var links = (c.html.match(/<a\b[^>]*href\s*=\s*["']https?:\/\//gi) || []).length;
        var fromEmail = c.from_email || MP.state.fromEmail;
        var fromName = c.from_name || MP.state.fromName;
        var items = [
          [c.subject.trim() ? 'ok' : 'bad', 'Subject line', c.subject.trim() ? '“' + esc(c.subject) + '”' : 'Add a subject line in step 1.', 0],
          [fromEmail ? 'ok' : 'bad', 'Sender', esc(fromName ? fromName + ' <' + fromEmail + '>' : fromEmail), 0],
          [aud.sendable > 0 ? 'ok' : 'bad', 'Audience', aud.sendable > 0 ? '<b>' + MP.num(aud.sendable) + '</b> recipients' + (aud.skipped ? ' · ' + MP.num(aud.skipped) + ' will be skipped (unsubscribed, bounced or invalid)' : '') : 'Choose at least one Email House with active contacts (step 2).', 1],
          [c.html.trim() ? 'ok' : 'bad', 'Email content', c.html.trim() ? 'HTML ready · ' + MP.plural(links, 'link') + ' will be tracked' : 'Add your HTML in step 3.', 2],
          [hasUnsub ? 'ok' : 'warn', 'Unsubscribe link', hasUnsub ? 'Your template contains {{unsubscribe_url}}.' : 'No {{unsubscribe_url}} in your HTML — a small compliant footer with an unsubscribe link will be added automatically.', 2],
          [eng.smtp_configured ? 'ok' : 'bad', 'Mail server', eng.smtp_configured ? 'SMTP is configured.' : 'Configure your SMTP settings before launching. <a href="#/settings/sender">Open settings →</a>', -1],
          [testSent ? 'ok' : 'warn', 'Test email', testSent ? 'You sent yourself a test. Nice!' : 'Recommended: send yourself a test and check it on desktop and mobile. <a href="#" id="revTest">Send a test now →</a>', -1]
        ];
        var lim = eng.hourly_limit || 0;
        var eta = aud.sendable && lim ? MP.duration(aud.sendable / lim * 3600) : null;
        var now = new Date(Date.now() + 3600e3);
        now.setMinutes(0, 0, 0);
        var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

        p.innerHTML =
          '<div class="grid-2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);align-items:start">' +
          '<div class="card pad"><h3 style="font-size:17px;margin-bottom:6px">Final check</h3><div class="review-list">' +
          items.map(function (it, i) {
            var ic = it[0] === 'ok' ? 'check' : it[0] === 'bad' ? 'x' : 'alert';
            return '<div class="review-item"><div class="ri ' + it[0] + '" style="animation-delay:' + (i * 0.07) + 's">' + icon(ic) + '</div><div style="flex:1;min-width:0"><b>' + it[1] + '</b><span>' + it[2] + '</span></div>' +
              (it[3] >= 0 && it[0] !== 'ok' ? '<button class="btn sm ghost" data-step="' + it[3] + '">Fix</button>' : '') + '</div>';
          }).join('') + '</div>' +
          '<div class="section-title">Tracking</div><div class="stack">' +
          MP.switchHtml('track_opens', c.track_opens, 'Track opens', 'Adds an invisible 1px image. Some apps (e.g. Apple Mail) pre-load images, so opens can be over-counted.') +
          MP.switchHtml('track_clicks', c.track_clicks, 'Track clicks', 'Links are routed through ' + esc((MP.state.appUrl || '').replace(/^https?:\/\//, '')) + ' to count clicks.') +
          '</div></div>' +
          '<div class="card pad"><h3 style="font-size:17px;margin-bottom:14px">When should it go out?</h3>' +
          '<div class="stack"><div class="choice on" data-when="now"><span class="radio"></span><div><b>Send now</b><span>Starts within minutes' + (eta ? ' · takes ≈ ' + eta + ' at ' + MP.num(lim) + '/hour' : '') + '</span></div></div>' +
          '<div class="choice" data-when="later"><span class="radio"></span><div><b>Schedule for later</b><span>Pick a date and time (your local time)</span></div></div>' +
          '<input type="datetime-local" class="input hidden" id="schedAt" value="' + local + '"></div>' +
          '<button class="btn primary lg mt-24" id="launchBtn" style="width:100%"' + (problems.length || aud.sendable === 0 ? ' disabled' : '') + '>' + icon('rocket') + '<span>Launch campaign</span></button>' +
          (problems.length ? '<div class="alert error mt-16">' + icon('alert') + '<div class="grow">' + problems.map(esc).join('<br>') + '</div></div>' : '') +
          '<div class="hint mt-16" style="text-align:center">Emails are sent in the background (cron) at up to ' + (lim ? MP.num(lim) + ' per hour' : 'full speed') + '. You can pause at any time.</div>' +
          '</div></div>';

        $$('[data-step]', p).forEach(function (b) { b.addEventListener('click', function () { goStep(+b.getAttribute('data-step')); }); });
        var rt = $('#revTest', p);
        if (rt) rt.addEventListener('click', function (e) { e.preventDefault(); openTest(); });
        $$('.switch input', p).forEach(function (i) { i.addEventListener('change', function () { c[i.name] = i.checked; markDirty(); }); });
        var when = 'now';
        $$('.choice', p).forEach(function (ch) {
          ch.addEventListener('click', function () {
            when = ch.getAttribute('data-when');
            $$('.choice', p).forEach(function (x) { x.classList.toggle('on', x === ch); });
            $('#schedAt', p).classList.toggle('hidden', when !== 'later');
            $('#launchBtn span', p).textContent = when === 'later' ? 'Schedule campaign' : 'Launch campaign';
          });
        });
        $('#launchBtn', p).addEventListener('click', function () {
          var btn = this;
          var sched = '';
          if (when === 'later') {
            var v = $('#schedAt', p).value;
            if (!v) return MP.toast('Pick a date and time', 'error');
            var d = new Date(v);
            if (d.getTime() < Date.now()) return MP.toast('That time is in the past', 'error');
            sched = d.toISOString();
          }
          MP.confirm({
            title: sched ? 'Schedule this campaign?' : 'Ready for lift-off?',
            icon: 'rocket',
            text: (sched ? 'It will start on <b>' + esc(MP.date(sched)) + '</b> and go to ' : 'This will send your email to ') + '<b>' + MP.num(aud.sendable) + ' recipients</b>. You can pause it at any time.',
            confirmLabel: sched ? 'Schedule' : 'Launch now'
          }).then(function (ok) {
            if (!ok) return;
            MP.busy(btn, function () {
              return save(true).then(function () {
                return MP.api('campaign.launch', { id: c.id, schedule_at: sched });
              }).then(function (r) {
                dirty = false;
                MP.confetti();
                MP.modal({
                  title: '',
                  body: '<div class="launch-ok"><div class="rocket">🚀</div><h2 style="font-size:24px;margin:12px 0 8px">' + (sched ? 'Campaign scheduled!' : 'Campaign launched!') + '</h2>' +
                    '<p class="muted" style="margin:0 0 6px">' + MP.num(r.queued) + ' emails are queued' + (sched ? ' for ' + esc(MP.date(sched)) : ' and sending has begun') + '.</p>' +
                    '<p class="hint">Watch the numbers come in live on the report page.</p></div>',
                  actions: [{ label: 'Open live report', cls: 'primary', icon: 'chart' }],
                  onClose: function () { MP.go('/campaigns/' + c.id); }
                });
                MP.refreshEngine().catch(function () {});
              });
            }).catch(function () {});
          });
        });
      }).catch(function (e) {
        p.innerHTML = '<div class="alert error">' + icon('alert') + '<div class="grow">' + esc(e.message) + '</div></div>';
      });
    }

    function openTest() {
      var last = MP.store.get('test-email', MP.state.fromEmail || '');
      MP.modal({
        title: 'Send a test email',
        icon: 'mail',
        text: 'See exactly what your recipients will get. Merge tags are filled with sample data and links are not tracked.',
        body: '<div class="field"><label>Send to</label><input class="input" id="testTo" type="email" value="' + esc(last) + '" placeholder="you@example.com"></div>',
        actions: [
          { label: 'Cancel', cls: 'ghost' },
          {
            label: 'Send test', cls: 'primary', icon: 'send', onClick: function (m) {
              var to = $('#testTo', m.el).value.trim();
              MP.store.set('test-email', to);
              var data = payload();
              data.to = to;
              return MP.api('campaign.test', data).then(function (r) {
                testSent = true;
                MP.store.set('test-sent-' + (c.id || 'new'), true);
                MP.toast(r.message);
                if (step === 3) goStep(3);
              });
            }
          }
        ]
      });
    }
  }
  MP.route('/campaigns/new', editor, 'campaigns');
  MP.route('/campaigns/:id/edit', editor, 'campaigns');

  /* ------------------------------------------------------------ report */
  var DONUT = [
    { key: 'sent', label: 'Delivered', color: '#12b76a', filter: 'sent' },
    { key: 'pending', label: 'Queued', color: '#a5b4fc', filter: 'pending' },
    { key: 'bounced', label: 'Bounced', color: '#f04438', filter: 'bounced' },
    { key: 'failed', label: 'Failed', color: '#f59e0b', filter: 'failed' },
    { key: 'invalid', label: 'Invalid address', color: '#0ea5e9', filter: 'invalid' },
    { key: 'skipped', label: 'Skipped', color: '#94a3b8', filter: 'skipped' }
  ];
  var FILTERS = [
    ['', 'All'], ['sent', 'Delivered'], ['opened', 'Opened'], ['clicked', 'Clicked'], ['pending', 'Queued'], ['bounced', 'Bounced'],
    ['invalid', 'Invalid'], ['failed', 'Failed'], ['skipped', 'Skipped'], ['unsubscribed', 'Unsubscribed']
  ];
  var EVENTS = {
    opened: { ic: 'eye', tone: 'var(--success)', bg: 'var(--success-soft)', text: 'opened the email' },
    clicked: { ic: 'pointer', tone: 'var(--warning)', bg: 'var(--warning-soft)', text: 'clicked a link' },
    hard_bounce: { ic: 'bounce', tone: 'var(--danger)', bg: 'var(--danger-soft)', text: 'bounced (address does not exist)' },
    soft_bounce: { ic: 'bounce', tone: 'var(--warning)', bg: 'var(--warning-soft)', text: 'soft-bounced (temporary)' },
    unsubscribed: { ic: 'userx', tone: 'var(--pink)', bg: 'var(--pink-soft)', text: 'unsubscribed' },
    sent: { ic: 'send', tone: 'var(--primary)', bg: 'var(--primary-soft)', text: 'was sent the email' }
  };

  MP.route('/campaigns/:id', function (el, params, ctx) {
    MP.setCrumbs([{ label: 'Campaigns', href: '/campaigns' }, { label: 'Report' }]);
    el.innerHTML = MP.skeleton(5);
    var id = +params.id;
    var data = null, timer = null, tableTimer = null;
    var tstate = { filter: '', q: '', page: 1 };
    var built = false;

    function load() {
      return MP.api('campaign.report', { id: id }).then(function (r) {
        if (!ctx.alive()) return;
        if (r.campaign.status === 'draft') { MP.go('/campaigns/' + id + '/edit'); return; }
        var prevStatus = data && data.campaign.status;
        data = r;
        if (!built) build(); else update(prevStatus !== r.campaign.status);
        clearTimeout(timer);
        var live = r.campaign.status === 'sending' || r.campaign.status === 'scheduled';
        timer = setTimeout(load, live ? 4000 : 30000);
      });
    }

    function actions() {
      var s = data.campaign.status;
      var h = '';
      if (s === 'sending') h += '<button class="btn" data-act="pause">' + icon('pause') + '<span>Pause</span></button>';
      if (s === 'paused') h += '<button class="btn primary" data-act="resume">' + icon('play') + '<span>Resume sending</span></button>';
      if (s === 'scheduled') h += '<button class="btn" data-act="unschedule">' + icon('calendar') + '<span>Cancel schedule</span></button>';
      h += '<button class="btn" data-act="export">' + icon('download') + '<span>Export</span></button>';
      h += '<button class="btn icon" data-act="more">' + icon('more') + '</button>';
      return h;
    }

    function build() {
      built = true;
      var c = data.campaign;
      MP.setCrumbs([{ label: 'Campaigns', href: '/campaigns' }, { label: c.name }]);
      el.innerHTML =
        '<a class="back" href="#/campaigns">' + icon('left') + '<span>All campaigns</span></a>' +
        '<div class="page-head" style="margin-top:0"><div style="min-width:0"><div class="row wrap"><h1 class="trunc" id="rName"></h1><span id="rBadge"></span></div>' +
        '<p id="rSub"></p></div><div class="actions" id="rActions"></div></div>' +
        '<div id="rAlerts" class="stack mb-16"></div>' +
        '<div class="card report-hero mb-16"><div><div class="row"><span class="big-pct" id="rPct">0%</span><div><b id="rProg"></b><div class="hint" id="rEta"></div></div><span class="spacer"></span><span id="rLive"></span></div>' +
        '<div class="progress lg mt-16" id="rBar"><i></i></div></div></div>' +
        '<div class="kpis five stagger" id="rKpis"></div>' +
        '<div class="dash-grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)">' +
        '<div class="card"><div class="card-head"><div><h3>Delivery breakdown</h3><p>What happened to every recipient</p></div></div><div class="card-body"><div class="donut-wrap" id="rDonut"></div></div></div>' +
        '<div class="card"><div class="card-head"><div><h3>Live activity</h3><p>Latest events</p></div><span class="spacer"></span><span class="live-tag" id="feedLive"></span></div><div class="feed" id="rFeed" style="padding:8px 0"></div></div>' +
        '</div>' +
        '<div class="card mt-16" id="rLinksCard"><div class="card-head"><div><h3>Link clicks</h3><p>Which links people clicked (unique clickers / total clicks)</p></div></div><div id="rLinks"></div></div>' +
        '<div class="card mt-16" id="rTable"><div class="card-head"><div><h3>Recipients</h3><p>Every address and exactly what happened</p></div></div>' +
        '<div class="tabs" id="rTabs" style="padding:0 12px">' + FILTERS.map(function (f) { return '<button data-tab="' + f[0] + '"' + (f[0] === tstate.filter ? ' class="on"' : '') + '>' + f[1] + '</button>'; }).join('') + '</div>' +
        '<div class="toolbar"><div class="input-icon">' + icon('search') + '<input class="input" id="rSearch" placeholder="Search email or name…"></div><span class="spacer"></span>' +
        '<button class="btn sm" id="rExportView">' + icon('download') + '<span>Export this view</span></button></div>' +
        '<div class="table-wrap" id="rRows"></div><div id="rPager"></div></div>';
      var tabs = MP.tabs($('#rTabs', el), function (v) { tstate.filter = v; tstate.page = 1; loadTable(); });
      el._tabs = tabs;
      $('#rSearch', el).addEventListener('input', MP.debounce(function () { tstate.q = this.value; tstate.page = 1; loadTable(); }, 300));
      $('#rExportView', el).addEventListener('click', function () { MP.download('campaign.export', { id: id, filter: tstate.filter, q: tstate.q }); });
      $('#rActions', el).addEventListener('click', onAction);
      update(true, true);
      loadTable();
    }

    function kpiTile(key, tone, ic, label, val, sub, filter, opts) {
      opts = opts || {};
      return '<div class="card kpi tone-' + tone + ' clickable" data-filter="' + filter + '" id="k-' + key + '">' +
        '<div class="k-top"><div class="k-ico">' + icon(ic) + '</div>' + label + '</div>' +
        '<div class="k-val" data-count="' + val + '"' + (opts.dec ? ' data-dec="1" data-suffix="%"' : '') + '>0</div><div class="k-sub">' + sub + '</div>' + icon(ic, 'spark') + '</div>';
    }

    function update(statusChanged, first) {
      var c = data.campaign, s = data.stats, e = data.engine;
      $('#rName', el).textContent = c.name;
      $('#rBadge', el).innerHTML = MP.badge(c.status);
      $('#rSub', el).innerHTML = '<b>' + esc(c.subject) + '</b><br><span class="faint">' +
        (data.lists.length ? 'To ' + data.lists.map(function (l) { return '<span class="row" style="display:inline-flex;gap:5px"><span class="dot-c hc-' + esc(l.color) + '"></span>' + esc(l.name) + '</span>'; }).join(', ') + ' · ' : '') +
        (c.status === 'scheduled' ? 'Scheduled for ' + MP.date(c.scheduled_at) : c.started_at ? 'Started ' + MP.date(c.started_at) : '') +
        (c.completed_at ? ' · Finished ' + MP.date(c.completed_at) : '') + '</span>';
      if (statusChanged) $('#rActions', el).innerHTML = actions();

      // alerts
      var alerts = '';
      var serverProblem = c.last_error && /^Mail server problem/.test(c.last_error);
      if (c.last_error && (c.status === 'paused' || (c.status === 'sending' && (!serverProblem || e.engine_error)))) alerts += '<div class="alert error">' + icon('octagon') + '<div class="grow"><b>Heads up:</b> ' + esc(c.last_error) + '</div>' + (c.status === 'paused' ? '<button class="btn sm" data-act="resume">Resume</button>' : '') + '</div>';
      if (c.status === 'sending' && !e.cron_ok) alerts += '<div class="alert info">' + icon('info') + '<div class="grow"><b>Sending from this browser tab.</b> The cron job is not running yet, so keep this page open — or <a href="#/settings/cron">set up the cron job</a> so sending continues in the background.</div></div>';
      if (c.status === 'sending' && s.pending > 0 && e.hourly_limit && e.sent_last_hour >= e.hourly_limit) alerts += '<div class="alert warn">' + icon('hourglass') + '<div class="grow"><b>Hourly limit reached</b> (' + MP.num(e.hourly_limit) + '/hour). Sending continues automatically when the limit resets.</div></div>';
      if (c.status === 'paused' && !c.last_error) alerts += '<div class="alert warn">' + icon('pause') + '<div class="grow">This campaign is paused. ' + MP.num(s.pending) + ' emails are waiting.</div><button class="btn sm" data-act="resume">Resume</button></div>';
      var al = $('#rAlerts', el);
      if (al.getAttribute('data-h') !== alerts) {
        al.innerHTML = alerts;
        al.setAttribute('data-h', alerts);
        $$('[data-act]', al).forEach(function (b) { b.addEventListener('click', onAction); });
      }

      // hero
      var live = c.status === 'sending';
      var pctEl = $('#rPct', el);
      pctEl.setAttribute('data-count', s.progress);
      pctEl.setAttribute('data-dec', '1');
      pctEl.setAttribute('data-suffix', '%');
      $('#rProg', el).textContent = MP.num(s.processed) + ' of ' + MP.num(s.total) + ' processed';
      var eta = '';
      if (live && s.pending && e.hourly_limit) eta = '≈ ' + MP.duration(s.pending / e.hourly_limit * 3600) + ' left at ' + MP.num(e.hourly_limit) + '/hour';
      else if (c.status === 'completed') eta = 'Finished ' + MP.ago(c.completed_at);
      else if (c.status === 'scheduled') eta = 'Starts ' + MP.ago(c.scheduled_at);
      else if (s.retrying) eta = MP.num(s.retrying) + ' waiting to retry';
      $('#rEta', el).textContent = eta;
      $('#rLive', el).innerHTML = live ? '<span class="live-tag"><span class="pulse on"></span>Live</span>' : '';
      $('#feedLive', el).innerHTML = live ? '<span class="pulse on"></span>Live' : '';
      var bar = $('#rBar', el);
      bar.className = 'progress lg mt-16' + (live ? ' live' : '') + (c.status === 'completed' ? ' success' : '');
      requestAnimationFrame(function () { $('i', bar).style.width = s.progress + '%'; });

      // KPIs
      var k = $('#rKpis', el);
      if (first) {
        k.innerHTML =
          kpiTile('total', 'primary', 'users', 'Recipients', s.total, 'Unique addresses', '') +
          kpiTile('sent', 'success', 'mailcheck', 'Delivered', s.sent, '<b id="ks-sent">' + MP.pct(s.delivery_rate) + '</b> of attempts', 'sent') +
          kpiTile('pending', 'slate', 'hourglass', 'Queued', s.pending, 'Waiting to be sent', 'pending') +
          kpiTile('opened', 'info', 'eye', 'Opened', s.opened, '<b id="ks-open">' + MP.pct(s.open_rate) + '</b> open rate', 'opened') +
          kpiTile('clicked', 'warning', 'pointer', 'Clicked', s.clicked, '<b id="ks-click">' + MP.pct(s.click_rate) + '</b> click rate', 'clicked') +
          kpiTile('unsub', 'pink', 'userx', 'Unsubscribed', s.unsubscribed, 'Removed themselves', 'unsubscribed') +
          kpiTile('bounced', 'danger', 'bounce', 'Bounced', s.bounced, '<span id="ks-bounce">' + MP.num(s.hard_bounces) + ' hard · ' + MP.num(s.soft_bounces) + ' soft</span>', 'bounced') +
          kpiTile('invalid', 'info', 'mailx', 'Invalid / vanished', s.invalid, 'Bad format or dead domain', 'invalid') +
          kpiTile('failed', 'warning', 'xcircle', 'Failed', s.failed, 'Rejected by the server', 'failed') +
          kpiTile('skipped', 'slate', 'skip', 'Skipped', s.skipped, 'Suppressed / unsubscribed', 'skipped');
        $$('.kpi', k).forEach(function (t) {
          t.addEventListener('click', function () {
            tstate.filter = t.getAttribute('data-filter');
            tstate.page = 1;
            $$('#rTabs button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tstate.filter); });
            el._tabs.refresh();
            loadTable();
            $('#rTable', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      } else {
        var map = { total: s.total, sent: s.sent, pending: s.pending, opened: s.opened, clicked: s.clicked, unsub: s.unsubscribed, bounced: s.bounced, invalid: s.invalid, failed: s.failed, skipped: s.skipped };
        Object.keys(map).forEach(function (key) { var v = $('#k-' + key + ' .k-val', el); if (v) v.setAttribute('data-count', map[key]); });
        $('#ks-sent', el).textContent = MP.pct(s.delivery_rate);
        $('#ks-open', el).textContent = MP.pct(s.open_rate);
        $('#ks-click', el).textContent = MP.pct(s.click_rate);
        $('#ks-bounce', el).textContent = MP.num(s.hard_bounces) + ' hard · ' + MP.num(s.soft_bounces) + ' soft';
      }
      MP.countUp(el);

      // donut
      drawDonut(s);
      // feed
      $('#rFeed', el).innerHTML = data.activity.length ? data.activity.map(function (a) {
        var ev = EVENTS[a.ev] || EVENTS.sent;
        return '<div class="feed-item"><div class="fi" style="background:' + ev.bg + ';color:' + ev.tone + '">' + icon(ev.ic) + '</div><div class="f-main trunc"><b>' + esc(a.email) + '</b> <span class="muted">' + ev.text + '</span></div><div class="f-time">' + MP.ago(a.t) + '</div></div>';
      }).join('') : '<div class="hint" style="padding:30px 22px;text-align:center">No activity yet. Events appear here in real time.</div>';
      // links
      var lc = $('#rLinksCard', el);
      lc.classList.toggle('hidden', !data.links.length);
      var maxClicks = Math.max.apply(null, [1].concat(data.links.map(function (l) { return l.unique_clicks; })));
      $('#rLinks', el).innerHTML = data.links.map(function (l) {
        return '<div class="link-row"><div class="lu"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.url) + '</a></div><div class="lb"><div class="progress"><i style="width:' + (l.unique_clicks / maxClicks * 100) + '%"></i></div><span><b style="color:var(--text)">' + MP.num(l.unique_clicks) + '</b> people · ' + MP.num(l.clicks) + ' clicks</span></div></div>';
      }).join('');
      if (!first && data.campaign.status === 'sending') {
        clearTimeout(tableTimer);
        tableTimer = setTimeout(function () { loadTable(true); }, 300);
      }
    }

    function drawDonut(s) {
      var box = $('#rDonut', el);
      var total = s.total || 0;
      var R = 80, C = 2 * Math.PI * R;
      var segs = DONUT.map(function (d) { return { d: d, v: s[d.key] || 0 }; });
      if (!$('svg', box)) {
        box.innerHTML = '<div class="donut"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="' + R + '" style="stroke:var(--surface-3)"/>' +
          segs.map(function (sg, i) { return '<circle data-seg="' + i + '" cx="100" cy="100" r="' + R + '" style="stroke:' + sg.d.color + '" stroke-dasharray="0 ' + C + '" stroke-dashoffset="0"/>'; }).join('') +
          '</svg><div class="center"><div><b id="dCenter">0%</b><span>delivered</span></div></div></div><div class="dlegend" id="dLegend"></div>';
        $('#dLegend', box).addEventListener('click', function (e) {
          var row = e.target.closest('[data-f]');
          if (!row) return;
          var k = $('.kpi[data-filter="' + row.getAttribute('data-f') + '"]', el);
          if (k) k.click();
        });
      }
      var offset = 0;
      requestAnimationFrame(function () {
        segs.forEach(function (sg, i) {
          var len = total ? sg.v / total * C : 0;
          var circ = $('circle[data-seg="' + i + '"]', box);
          circ.setAttribute('stroke-dasharray', Math.max(0, len - (len > 3 ? 2 : 0)) + ' ' + C);
          circ.setAttribute('stroke-dashoffset', -offset);
          offset += len;
        });
      });
      var attempted = s.sent + s.bounced + s.failed;
      $('#dCenter', box).textContent = (attempted ? Math.round(s.sent / attempted * 1000) / 10 : 0) + '%';
      $('#dLegend', box).innerHTML = segs.map(function (sg) {
        return '<div data-f="' + sg.d.filter + '"><i style="background:' + sg.d.color + '"></i><span>' + sg.d.label + '</span><b>' + MP.num(sg.v) + '</b><span class="pct">' + (total ? MP.pct(sg.v / total * 100) : '0%') + '</span></div>';
      }).join('');
    }

    function statusCell(r) {
      var b = MP.badge(r.status);
      if (r.status === 'bounced' && r.bounce_type) b = MP.badge(r.bounce_type === 'hard' ? 'hard' : 'soft');
      var extra = [];
      if (r.opened_at) extra.push('<span class="badge info">' + icon('eye', 'ico').replace('class="ico"', 'class="ico" style="width:12px;height:12px"') + ' ' + r.opens + '</span>');
      if (r.clicked_at) extra.push('<span class="badge warning">' + icon('pointer', 'ico').replace('class="ico"', 'class="ico" style="width:12px;height:12px"') + ' ' + r.clicks + '</span>');
      if (r.unsubscribed_at) extra.push(MP.badge('unsubscribed'));
      return '<div class="row" style="gap:6px;flex-wrap:wrap">' + b + extra.join('') + '</div>';
    }

    function loadTable(quiet) {
      var box = $('#rRows', el);
      if (!box) return;
      if (!quiet) box.style.opacity = '.5';
      return MP.api('campaign.recipients', { id: id, filter: tstate.filter, q: tstate.q, page: tstate.page, per: 25 }).then(function (r) {
        if (!ctx.alive()) return;
        box.style.opacity = '';
        box.style.transition = 'opacity .2s';
        if (!r.rows.length) {
          box.innerHTML = MP.empty('inbox', 'No recipients here', tstate.q ? 'Nothing matches your search.' : 'No recipients in this category yet.');
        } else {
          box.innerHTML = '<table class="table"><thead><tr><th>Recipient</th><th>Status</th><th>Details</th><th>Sent</th></tr></thead><tbody>' +
            r.rows.map(function (x, i) {
              var det = x.error ? '<div class="t-err trunc" title="' + esc(x.error) + '">' + esc(x.error) + '</div>'
                : x.clicked_at ? '<span class="t-sub">Clicked ' + MP.ago(x.clicked_at) + '</span>'
                  : x.opened_at ? '<span class="t-sub">Opened ' + MP.ago(x.opened_at) + '</span>'
                    : x.status === 'pending' ? '<span class="t-sub">' + (x.next_attempt_at ? 'Retry ' + MP.ago(x.next_attempt_at) : 'In the queue') + '</span>' : '<span class="t-sub">—</span>';
              return '<tr class="clickable" data-i="' + i + '" style="' + (quiet ? 'animation:none' : '') + '"><td><div class="t-email">' + esc(x.email) + '</div>' + (x.name ? '<div class="t-sub">' + esc(x.name) + '</div>' : '') + '</td>' +
                '<td>' + statusCell(x) + '</td><td>' + det + '</td><td class="t-sub nowrap">' + (x.sent_at ? MP.date(x.sent_at) : '—') + '</td></tr>';
            }).join('') + '</tbody></table>';
          $$('tr[data-i]', box).forEach(function (tr) { tr.addEventListener('click', function () { recipientDrawer(r.rows[+tr.getAttribute('data-i')]); }); });
        }
        var pg = $('#rPager', el);
        pg.innerHTML = '';
        pg.appendChild(MP.pager(r, function (p) { tstate.page = p; loadTable(); }));
      }).catch(function (e) { box.style.opacity = ''; MP.toast(e.message, 'error'); });
    }

    function recipientDrawer(r) {
      var tl = [];
      tl.push(['Added to the queue', null, 'var(--text-3)']);
      if (r.sent_at) tl.push(['Sent', r.sent_at, 'var(--primary)']);
      if (r.opened_at) tl.push(['First opened' + (r.opens > 1 ? ' · ' + r.opens + ' opens' : ''), r.opened_at, 'var(--success)']);
      if (r.clicked_at) tl.push(['First click' + (r.clicks > 1 ? ' · ' + r.clicks + ' clicks' : ''), r.clicked_at, 'var(--warning)']);
      if (r.bounced_at) tl.push([(r.bounce_type === 'hard' ? 'Hard' : 'Soft') + ' bounce', r.bounced_at, 'var(--danger)']);
      if (r.unsubscribed_at) tl.push(['Unsubscribed', r.unsubscribed_at, 'var(--pink)']);
      if (r.complained_at) tl.push(['Marked as spam', r.complained_at, 'var(--danger)']);
      var explain = {
        invalid: 'This address is incorrect: either the format is wrong or its domain does not exist / cannot receive email. It was not sent and is now suppressed.',
        bounced: r.bounce_type === 'hard' ? 'The receiving server said this mailbox does not exist (vanished). It is suppressed and will never be emailed again.' : 'Temporary problem (mailbox full, server busy…). The address is kept and can be emailed again later.',
        failed: 'The mail server rejected this message. See the error below.',
        skipped: 'Not sent because the address is on the suppression list (unsubscribed, bounced before, or blocked).',
        pending: 'Waiting in the queue — it will be sent automatically.',
        sent: 'Accepted by the mail server for delivery.'
      }[r.status] || '';
      MP.drawer({
        title: r.email,
        subtitle: r.name || 'Recipient',
        icon: 'mail',
        body: '<div class="row" style="margin-bottom:14px">' + statusCell(r) + '</div>' +
          (explain ? '<div class="alert ' + (r.status === 'sent' ? 'ok' : r.status === 'pending' ? 'info' : r.status === 'skipped' ? 'info' : 'error') + ' mb-16">' + icon('info') + '<div class="grow">' + explain + '</div></div>' : '') +
          (r.error ? '<div class="section-title">Server message</div><div class="samples" style="color:var(--text);max-height:none;white-space:pre-wrap">' + esc(r.error) + '</div>' : '') +
          '<div class="section-title">Timeline</div><div class="timeline">' + tl.map(function (t, i) {
            return '<div class="tl-item" style="--tl:' + t[2] + ';animation-delay:' + (i * 0.06) + 's"><b>' + esc(t[0]) + '</b><span>' + (t[1] ? MP.date(t[1]) + ' · ' + MP.ago(t[1]) : '') + '</span></div>';
          }).join('') + '</div>' +
          '<div class="section-title">Attempts</div><div class="hint">' + MP.plural(r.attempts, 'delivery attempt') + '</div>'
      });
    }

    function onAction(e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      var c = data.campaign;
      var simple = function (action, msg) {
        return MP.busy(b, function () {
          return MP.api(action, { id: id }).then(function () { MP.toast(msg); MP.refreshEngine().catch(function () {}); return load(); });
        }).catch(function () {});
      };
      if (act === 'pause') simple('campaign.pause', 'Campaign paused');
      else if (act === 'resume') simple('campaign.resume', 'Sending resumed');
      else if (act === 'unschedule') {
        MP.confirm({ title: 'Cancel the schedule?', text: 'The campaign goes back to draft so you can edit it or launch it later.', confirmLabel: 'Back to draft' })
          .then(function (ok) { if (ok) MP.api('campaign.cancel', { id: id }).then(function () { MP.toast('Schedule cancelled'); MP.go('/campaigns/' + id + '/edit'); }).catch(function (er) { MP.toast(er.message, 'error'); }); });
      } else if (act === 'export') {
        MP.dropdown(b, [{ header: 'Download CSV' }].concat(FILTERS.map(function (f) {
          return { label: f[1] + ' recipients', icon: 'download', onClick: function () { MP.download('campaign.export', { id: id, filter: f[0] }); } };
        })));
      } else if (act === 'more') {
        var items = [
          { label: 'View email', icon: 'eye', onClick: viewEmail },
          { label: 'Duplicate campaign', icon: 'copy', onClick: function () {
            MP.api('campaign.duplicate', { id: id }).then(function (r) { MP.toast('Duplicated — opening the copy'); MP.go('/campaigns/' + r.id + '/edit'); }).catch(function (er) { MP.toast(er.message, 'error'); });
          } }
        ];
        if (c.status === 'sending' || c.status === 'paused') {
          items.push('-', { label: 'Cancel campaign', icon: 'stop', danger: true, onClick: function () {
            MP.confirm({ title: 'Cancel this campaign?', text: 'Emails that were not sent yet will be skipped. This cannot be undone.', danger: true, confirmLabel: 'Cancel campaign', cancelLabel: 'Keep sending' })
              .then(function (ok) { if (ok) MP.api('campaign.cancel', { id: id }).then(function () { MP.toast('Campaign cancelled'); load(); }).catch(function (er) { MP.toast(er.message, 'error'); }); });
          } });
        }
        items.push('-', { label: 'Delete campaign', icon: 'trash', danger: true, onClick: function () {
          MP.confirm({ title: 'Delete this campaign?', text: 'The campaign and all its statistics will be permanently deleted.', danger: true, confirmLabel: 'Delete' })
            .then(function (ok) { if (ok) MP.api('campaign.delete', { id: id }).then(function () { MP.toast('Campaign deleted'); MP.go('/campaigns'); }).catch(function (er) { MP.toast(er.message, 'error'); }); });
        } });
        MP.dropdown(b, items);
      }
    }

    function viewEmail() {
      MP.api('campaign.html', { id: id }).then(function (r) {
        var m = MP.modal({
          title: r.subject || 'Email preview', icon: 'eye', size: 'xl',
          body: '<div class="editor-preview" style="height:70vh;border-radius:14px;overflow:hidden"><div class="frame"><iframe sandbox="allow-same-origin allow-popups" title="Email"></iframe></div></div>'
        });
        var html = fillSample(r.html);
        $('iframe', m.el).srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">') : '<base target="_blank">' + html;
      }).catch(function (e) { MP.toast(e.message, 'error'); });
    }

    function onEngineRun() { if (data && data.campaign.status === 'sending') { clearTimeout(timer); timer = setTimeout(load, 600); } }
    var off = MP.on('engine-run', onEngineRun);
    return load().then(function () {
      return function () { clearTimeout(timer); clearTimeout(tableTimer); off(); };
    });
  }, 'campaigns');
})();
