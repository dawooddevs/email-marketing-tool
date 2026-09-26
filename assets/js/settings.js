/* ==========================================================================
   MailPilot — Settings
   ========================================================================== */
(function () {
  'use strict';
  var MP = window.MP, $ = MP.$, $$ = MP.$$, esc = MP.esc, icon = MP.icon;
  var TABS = [
    ['sender', 'Sending (SMTP)', 'mail'],
    ['speed', 'Speed & limits', 'gauge'],
    ['bounces', 'Bounce tracking', 'bounce'],
    ['general', 'Tracking & compliance', 'globe'],
    ['cron', 'Cron job', 'clock'],
    ['account', 'Account', 'key']
  ];

  function field(label, name, value, opts) {
    opts = opts || {};
    return '<div class="field' + (opts.full ? ' full' : '') + '"><label>' + label + '</label>' +
      '<input class="input" name="' + name + '" type="' + (opts.type || 'text') + '" value="' + esc(value) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.attrs || '') + '>' +
      (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</div>';
  }
  function select(label, name, value, options, opts) {
    opts = opts || {};
    return '<div class="field' + (opts.full ? ' full' : '') + '"><label>' + label + '</label><select class="select" name="' + name + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select>' + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</div>';
  }
  function collect(form) {
    var out = {};
    $$('input[name], select[name], textarea[name]', form).forEach(function (i) {
      out[i.name] = i.type === 'checkbox' ? (i.checked ? '1' : '0') : i.value;
    });
    return out;
  }

  MP.route('/settings', function (el, p, ctx) { return view(el, 'sender', ctx); }, 'settings');
  MP.route('/settings/:tab', function (el, p, ctx) { return view(el, p.tab, ctx); }, 'settings');

  function view(el, tab, ctx) {
    if (!TABS.some(function (t) { return t[0] === tab; })) tab = 'sender';
    MP.setCrumbs([{ label: 'Settings' }]);
    el.innerHTML = MP.skeleton(3);
    var S;
    return MP.api('settings.get', {}).then(function (r) {
      if (!ctx.alive()) return;
      S = r;
      el.innerHTML = '<div class="page-head"><div><h1>Settings</h1><p>Configure how MailPilot sends email and tracks results.</p></div></div>' +
        '<div class="settings"><nav class="subnav" id="subnav">' + TABS.map(function (t) {
          return '<button data-t="' + t[0] + '"' + (t[0] === tab ? ' class="on"' : '') + '>' + icon(t[2]) + '<span>' + t[1] + '</span></button>';
        }).join('') + '</nav><div id="sPane"></div></div>';
      $('#subnav', el).addEventListener('click', function (e) {
        var b = e.target.closest('[data-t]'); if (!b) return;
        tab = b.getAttribute('data-t');
        $$('button', this).forEach(function (x) { x.classList.toggle('on', x === b); });
        MP.replacePath('/settings/' + tab);
        renderTab();
      });
      renderTab();
    });

    function renderTab() {
      var pane = $('#sPane', el);
      pane.innerHTML = '<div class="pane"></div>';
      var p = pane.firstElementChild;
      ({ sender: sender, speed: speed, bounces: bounces, general: general, cron: cron, account: account })[tab](p);
    }

    function saveSection(section, form, btn) {
      return MP.busy(btn, function () {
        return MP.api('settings.save', { section: section, values: collect(form) }).then(function (r) {
          S = r;
          MP.toast('Settings saved');
          if (section === 'sender') { MP.state.fromEmail = r.values.from_email; MP.state.fromName = r.values.from_name; }
          if (section === 'general') MP.state.appUrl = r.app_url_effective;
          $$('input[type=password]', form).forEach(function (i) { i.value = ''; });
          MP.refreshEngine().catch(function () {});
          return r;
        });
      }).catch(function () {});
    }

    /* ---------------- sending / SMTP */
    function sender(p) {
      var v = S.values;
      p.innerHTML =
        '<form class="card" id="f"><div class="card-head"><div><h3>Sender identity</h3><p>Who your campaigns come from</p></div></div><div class="card-body"><div class="form-grid">' +
        field('From name', 'from_name', v.from_name, { ph: 'DaudDev' }) +
        field('From email', 'from_email', v.from_email, { ph: 'marketing@dauddev.com', type: 'email', hint: 'Must be the mailbox you log in with below (or one it is allowed to send as).' }) +
        field('Reply-to (optional)', 'reply_to', v.reply_to, { ph: 'Where replies should go', full: true }) +
        '</div></div>' +
        '<div class="card-head" style="border-top:1px solid var(--border)"><div><h3>Mail server (SMTP)</h3><p>The server that delivers your email</p></div><span class="spacer"></span>' +
        '<button type="button" class="btn sm soft" id="preset1">' + icon('zap') + '<span>Spacemail preset</span></button><button type="button" class="btn sm" id="preset2"><span>cPanel mail preset</span></button></div>' +
        '<div class="card-body"><div class="form-grid">' +
        select('Send using', 'mailer', v.mailer, [['smtp', 'SMTP (recommended)'], ['mail', 'PHP mail() function']], { full: true, hint: 'SMTP gives much better deliverability and error reporting.' }) +
        '<div class="full smtp-only form-grid" style="gap:18px">' +
        field('SMTP host', 'smtp_host', v.smtp_host, { ph: 'mail.spacemail.com' }) +
        '<div class="form-grid" style="gap:12px">' + field('Port', 'smtp_port', v.smtp_port, { ph: '465', type: 'number' }) +
        select('Security', 'smtp_secure', v.smtp_secure, [['ssl', 'SSL/TLS (465)'], ['tls', 'STARTTLS (587)'], ['none', 'None']]) + '</div>' +
        field('Username', 'smtp_user', v.smtp_user, { ph: 'marketing@dauddev.com', attrs: ' autocomplete="off"' }) +
        field('Password', 'smtp_pass', '', { type: 'password', ph: S.has_smtp_pass ? '•••••••• (saved — leave empty to keep)' : 'Mailbox password', attrs: ' autocomplete="new-password"' }) +
        '</div></div></div>' +
        '<div class="card-body" style="border-top:1px solid var(--border)"><div class="row wrap"><button class="btn primary" type="submit">' + icon('check') + '<span>Save</span></button>' +
        '<span class="spacer"></span><input class="input" id="testTo" type="email" placeholder="Send a test to…" style="width:240px" value="' + esc(MP.store.get('test-email', '')) + '">' +
        '<button type="button" class="btn" id="testBtn">' + icon('send') + '<span>Send test email</span></button></div></div></form>' +
        '<div class="alert info mt-16">' + icon('info') + '<div class="grow"><b>Spacemail:</b> host <code>mail.spacemail.com</code>, port <code>465</code> SSL (or 587 STARTTLS), username = the full email address. ' +
        'Paid Spacemail plans allow about <b>500 emails per hour</b> per mailbox; trial plans only 20. For large lists consider an email-sending service (Brevo, Amazon SES, SMTP2GO, Mailgun) — just enter its SMTP details here.</div></div>';
      var f = $('#f', p);
      var toggle = function () { $('.smtp-only', f).style.display = f.mailer.value === 'smtp' ? '' : 'none'; };
      f.mailer.addEventListener('change', toggle);
      toggle();
      function preset(host) {
        f.mailer.value = 'smtp';
        toggle();
        f.smtp_host.value = host;
        f.smtp_port.value = '465';
        f.smtp_secure.value = 'ssl';
        if (!f.smtp_user.value) f.smtp_user.value = f.from_email.value || 'marketing@dauddev.com';
        [f.smtp_host, f.smtp_port, f.smtp_secure].forEach(function (i) { i.style.transition = 'box-shadow .3s'; i.style.boxShadow = '0 0 0 4px var(--primary-soft)'; setTimeout(function () { i.style.boxShadow = ''; }, 900); });
        MP.toast('Preset applied — enter the password and save');
      }
      $('#preset1', p).addEventListener('click', function () { preset('mail.spacemail.com'); });
      $('#preset2', p).addEventListener('click', function () {
        var dom = (f.from_email.value.split('@')[1] || 'dauddev.com');
        preset('mail.' + dom);
      });
      f.addEventListener('submit', function (e) { e.preventDefault(); saveSection('sender', f, $('button[type=submit]', f)); });
      $('#testBtn', p).addEventListener('click', function () {
        var btn = this, to = $('#testTo', p).value.trim();
        MP.store.set('test-email', to);
        MP.busy(btn, function () {
          return MP.api('settings.save', { section: 'sender', values: collect(f) }).then(function (r) {
            S = r;
            $$('input[type=password]', f).forEach(function (i) { i.value = ''; });
            return MP.api('settings.testSmtp', { to: to });
          }).then(function (r) { MP.toast(r.message, 'success', 6000); MP.refreshEngine().catch(function () {}); });
        }).catch(function () {});
      });
    }

    /* ---------------- speed */
    function speed(p) {
      var v = S.values;
      p.innerHTML =
        '<form class="card" id="f"><div class="card-head"><div><h3>Sending speed & limits</h3><p>Stay under your mail provider\'s limits so your mailbox never gets blocked</p></div></div><div class="card-body"><div class="form-grid">' +
        field('Max emails per hour', 'hourly_limit', v.hourly_limit, { type: 'number', attrs: ' min="0"', hint: 'Spacemail paid plans: 500/hour. We recommend 400 to leave room for your normal email. 0 = no limit.' }) +
        field('Max emails per day', 'daily_limit', v.daily_limit, { type: 'number', attrs: ' min="0"', hint: '0 = no daily limit.' }) +
        field('Emails per cron run', 'batch_size', v.batch_size, { type: 'number', attrs: ' min="1"', hint: 'The cron job runs every 5 minutes. 40 per run ≈ 480/hour (the hourly limit still applies).' }) +
        field('Pause between emails (ms)', 'delay_ms', v.delay_ms, { type: 'number', attrs: ' min="0"', hint: '1000 ms = 1 second. A small pause looks more natural to spam filters.' }) +
        field('Max seconds per cron run', 'cron_max_seconds', v.cron_max_seconds, { type: 'number', attrs: ' min="20"', hint: 'Keep below 5 minutes (300) when cron runs every 5 minutes.' }) +
        field('Auto-pause after failures in a row', 'pause_after_failures', v.pause_after_failures, { type: 'number', attrs: ' min="0"', hint: 'Protects your list if the server starts rejecting everything. 0 = never.' }) +
        '<div class="full">' + MP.switchHtml('check_domains', v.check_domains === '1', 'Check domains before sending', 'Addresses whose domain no longer exists (no mail server) are marked <b>invalid</b> without sending — protects your reputation.') + '</div>' +
        '</div><div class="status-line mt-24" id="est"></div></div>' +
        '<div class="card-body" style="border-top:1px solid var(--border)"><button class="btn primary" type="submit">' + icon('check') + '<span>Save</span></button></div></form>';
      var f = $('#f', p);
      function est() {
        var h = +f.hourly_limit.value || 0, b = +f.batch_size.value || 0, d = +f.daily_limit.value || 0;
        var perHour = Math.min(h || Infinity, b * 12);
        var perDay = Math.min(d || Infinity, perHour * 24);
        $('#est', p).innerHTML = icon('gauge') + '<div>Estimated throughput: <b>' + (isFinite(perHour) ? MP.num(perHour) : '∞') + ' emails/hour</b> · <b>' + (isFinite(perDay) ? MP.num(perDay) : '∞') + ' emails/day</b>' +
          '<div class="hint">10,000 emails would take about ' + (isFinite(perHour) && perHour ? MP.duration(Math.max(10000 / perHour, d ? 10000 / d * 24 : 0) * 3600) : '—') + '.</div></div>';
        $('#est svg', p).style.cssText = 'width:22px;height:22px;color:var(--primary);flex:none';
      }
      $$('input', f).forEach(function (i) { i.addEventListener('input', est); });
      est();
      f.addEventListener('submit', function (e) { e.preventDefault(); saveSection('speed', f, $('button[type=submit]', f)); });
    }

    /* ---------------- bounces */
    function bounces(p) {
      var v = S.values;
      p.innerHTML =
        '<form class="card" id="f"><div class="card-head"><div><h3>Bounce tracking</h3><p>Detect addresses that no longer exist</p></div></div><div class="card-body">' +
        '<div class="alert info mb-16">' + icon('info') + '<div class="grow">When you send to an address that does not exist, the receiving server usually accepts the message first and then sends a <b>bounce email</b> back to your mailbox a few minutes later. ' +
        'MailPilot logs into that mailbox (POP3), reads the bounces and marks those addresses as <b>bounced</b>. It also handles spam complaints and "unsubscribe" replies. Other emails are never touched.</div></div>' +
        MP.switchHtml('pop_enabled', v.pop_enabled === '1', 'Enable bounce processing', 'Checked automatically by the cron job about every 10 minutes.') +
        '<div class="form-grid mt-24">' +
        field('POP3 host', 'pop_host', v.pop_host, { ph: 'mail.spacemail.com' }) +
        '<div class="form-grid" style="gap:12px">' + field('Port', 'pop_port', v.pop_port, { type: 'number', ph: '995' }) +
        select('Security', 'pop_secure', v.pop_secure, [['ssl', 'SSL/TLS (995)'], ['tls', 'STARTTLS (110)'], ['none', 'None (110)']]) + '</div>' +
        field('Mailbox username', 'pop_user', v.pop_user, { ph: 'marketing@dauddev.com' }) +
        field('Mailbox password', 'pop_pass', '', { type: 'password', ph: S.has_pop_pass ? '•••••••• (saved)' : 'Empty = same as SMTP password', attrs: ' autocomplete="new-password"' }) +
        '<div class="full">' + MP.switchHtml('pop_delete', v.pop_delete === '1', 'Delete bounce messages after processing', 'Keeps your inbox clean. Normal emails and replies are never deleted.') + '</div>' +
        '</div></div><div class="card-body" style="border-top:1px solid var(--border)"><div class="row wrap"><button class="btn primary" type="submit">' + icon('check') + '<span>Save</span></button>' +
        '<button type="button" class="btn" id="testPop">' + icon('server') + '<span>Test connection</span></button><span class="spacer"></span>' +
        '<a class="btn ghost" href="#/suppression/bounces">' + icon('inbox') + '<span>View bounce log</span></a></div></div></form>';
      var f = $('#f', p);
      f.addEventListener('submit', function (e) { e.preventDefault(); saveSection('bounces', f, $('button[type=submit]', f)); });
      $('#testPop', p).addEventListener('click', function () {
        var btn = this;
        MP.busy(btn, function () {
          return MP.api('settings.save', { section: 'bounces', values: collect(f) }).then(function (r) {
            S = r;
            return MP.api('settings.testPop', {});
          }).then(function (r) { MP.toast(r.message, 'success', 6000); });
        }).catch(function () {});
      });
    }

    /* ---------------- general */
    function general(p) {
      var v = S.values;
      p.innerHTML =
        '<form class="card" id="f"><div class="card-head"><div><h3>Tracking & compliance</h3><p>Links, footer and legal information</p></div></div><div class="card-body"><div class="form-grid">' +
        field('App URL', 'app_url', v.app_url, { full: true, ph: 'https://marketing.dauddev.com', hint: 'Used for tracking links, open pixels and unsubscribe links. Must be publicly reachable. Current: <b>' + esc(S.app_url_effective) + '</b>' }) +
        '<div class="field full"><label>Company postal address</label><textarea class="textarea" name="company_address" rows="2" placeholder="DaudDev · Street 1 · City · Country">' + esc(v.company_address) + '</textarea>' +
        '<span class="hint">Anti-spam laws (CAN-SPAM, GDPR/PECR) require a physical address in marketing emails. Use {{company_address}} in your templates.</span></div>' +
        select('Timezone', 'timezone', v.timezone, S.timezones.map(function (t) { return [t, t]; }), { hint: 'Used for the {{date}} tag.' }) +
        '<div></div>' +
        '<div class="full stack">' +
        MP.switchHtml('auto_footer', v.auto_footer === '1', 'Automatic unsubscribe footer', 'If a campaign has no {{unsubscribe_url}}, a small footer with your address and an unsubscribe link is added.') +
        MP.switchHtml('default_track_opens', v.default_track_opens === '1', 'Track opens by default') +
        MP.switchHtml('default_track_clicks', v.default_track_clicks === '1', 'Track clicks by default') +
        '</div></div></div><div class="card-body" style="border-top:1px solid var(--border)"><button class="btn primary" type="submit">' + icon('check') + '<span>Save</span></button></div></form>';
      var f = $('#f', p);
      f.addEventListener('submit', function (e) { e.preventDefault(); saveSection('general', f, $('button[type=submit]', f)); });
    }

    /* ---------------- cron */
    function cron(p) {
      var c = S.cron;
      var ok = MP.state.engine && MP.state.engine.cron_ok;
      p.innerHTML =
        '<div class="card"><div class="card-head"><div><h3>Background sending (cron job)</h3><p>Lets campaigns send even when this page is closed</p></div></div><div class="card-body stack">' +
        '<div class="status-line"><span class="pulse ' + (ok ? 'on' : c.last_run ? 'warn' : 'err') + '"></span><div><b>' + (ok ? 'Cron is working' : c.last_run ? 'Cron has stopped' : 'Cron is not set up yet') + '</b>' +
        '<div class="hint">Last run: ' + (c.last_run ? MP.date(c.last_run) + ' (' + MP.ago(c.last_run) + ')' : 'never') + '</div></div></div>' +
        '<ol class="steps-list">' +
        '<li><div>Log in to <b>cPanel</b> (Spaceship → Hosting Manager → your plan → <b>cPanel</b>).</div></li>' +
        '<li><div>Open <b>Advanced → Cron Jobs</b>.</div></li>' +
        '<li><div>Under <b>Add New Cron Job</b> choose <b>Common Settings → Once Per Five Minutes (*/5 * * * *)</b>. Spaceship does not allow a shorter interval.</div></li>' +
        '<li><div>Paste this command and click <b>Add New Cron Job</b>:</div></li></ol>' +
        '<div class="copy-box"><code>' + esc(c.command) + '</code><button class="btn sm" data-copy="' + esc(c.command) + '">' + icon('copy') + '<span>Copy</span></button></div>' +
        '<div class="hint">If cPanel shows a different PHP path (e.g. <code>/opt/alt/php82/usr/bin/php</code>), use that instead of <code>/usr/local/bin/php</code>. Application folder: <code>' + esc(c.path) + '</code></div>' +
        '<div class="section-title" style="margin-bottom:0">Alternative: URL cron</div>' +
        '<div class="hint">If you cannot use cPanel cron, a free service like cron-job.org can open this secret URL every 5 minutes:</div>' +
        '<div class="copy-box"><code>' + esc(c.url) + '</code><button class="btn sm" data-copy="' + esc(c.url) + '">' + icon('copy') + '<span>Copy</span></button></div>' +
        '<div class="alert info">' + icon('info') + '<div class="grow">No cron yet? No problem: while a campaign is sending, keeping MailPilot open in a browser tab also sends the emails.</div></div>' +
        '</div></div>';
      $$('[data-copy]', p).forEach(function (b) { b.addEventListener('click', function () { MP.copy(b.getAttribute('data-copy')); }); });
    }

    /* ---------------- account */
    function account(p) {
      var u = MP.state.user;
      p.innerHTML =
        '<form class="card" id="f"><div class="card-head"><div><h3>Your account</h3><p>Change your username and password</p></div></div><div class="card-body">' +
        (u.must_change ? '<div class="alert warn mb-16">' + icon('key') + '<div class="grow">You are still using the initial password. Please set a new one.</div></div>' : '') +
        '<div class="form-grid">' +
        field('Username', 'username', u.username, { full: true, attrs: ' autocomplete="username"' }) +
        field('Current password', 'current_password', '', { type: 'password', full: true, attrs: ' autocomplete="current-password" required' }) +
        '<div class="field"><label>New password</label><input class="input" type="password" name="new_password" autocomplete="new-password" placeholder="At least 8 characters"><div class="strength" id="str"><i></i><i></i><i></i><i></i></div><span class="hint" id="strTxt">Leave empty to keep your current password.</span></div>' +
        field('Confirm new password', 'confirm_password', '', { type: 'password', attrs: ' autocomplete="new-password"' }) +
        '</div></div><div class="card-body" style="border-top:1px solid var(--border)"><button class="btn primary" type="submit">' + icon('check') + '<span>Update account</span></button></div></form>';
      var f = $('#f', p);
      f.new_password.addEventListener('input', function () {
        var v = this.value, score = 0;
        if (v.length >= 8) score++;
        if (v.length >= 12) score++;
        if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
        if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
        var colors = ['var(--danger)', 'var(--warning)', '#eab308', 'var(--success)'];
        $$('#str i', p).forEach(function (i, n) { i.style.background = v && n < score ? colors[Math.max(0, score - 1)] : ''; });
        $('#strTxt', p).textContent = !v ? 'Leave empty to keep your current password.' : ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][score];
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        MP.busy($('button[type=submit]', f), function () {
          return MP.api('account.update', collect(f)).then(function (r) {
            MP.userUpdated(r.user);
            MP.toast('Account updated');
            account(p);
          });
        }).catch(function () {});
      });
    }
  }
})();
