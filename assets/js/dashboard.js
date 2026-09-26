/* ==========================================================================
   MailPilot — Dashboard
   ========================================================================== */
(function () {
  'use strict';
  var MP = window.MP, $ = MP.$, $$ = MP.$$, esc = MP.esc, icon = MP.icon;

  function kpi(tone, ic, label, value, sub, opts) {
    opts = opts || {};
    return '<div class="card kpi tone-' + tone + (opts.go ? ' clickable' : '') + '"' + (opts.go ? ' data-go="' + opts.go + '"' : '') + '>' +
      '<div class="k-top"><div class="k-ico">' + icon(ic) + '</div>' + esc(label) + '</div>' +
      '<div class="k-val" data-count="' + value + '"' + (opts.dec ? ' data-dec="' + opts.dec + '"' : '') + (opts.suffix ? ' data-suffix="' + opts.suffix + '"' : '') + '>0</div>' +
      '<div class="k-sub">' + sub + '</div>' + icon(ic, 'spark') + '</div>';
  }
  MP.kpi = kpi;

  /** Bar chart (sent + opened) with animated bars and hover tooltip. */
  function barChart(el, days) {
    var W = 700, H = 220, padL = 34, padB = 26, padT = 10;
    var max = Math.max(4, Math.max.apply(null, days.map(function (d) { return d.sent; })));
    var step = Math.pow(10, Math.floor(Math.log10(max)));
    var top = Math.ceil(max / step) * step;
    var bw = (W - padL - 10) / days.length;
    var y = function (v) { return H - padB - (v / top) * (H - padB - padT); };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    for (var g = 0; g <= 4; g++) {
      var val = top / 4 * g, yy = y(val);
      svg += '<line x1="' + padL + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" style="stroke:var(--border)" stroke-dasharray="' + (g ? '3 4' : '0') + '"/>' +
        '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" style="fill:var(--text-3)">' + MP.num(Math.round(val)) + '</text>';
    }
    days.forEach(function (d, i) {
      var x = padL + i * bw + bw * 0.18, w = bw * 0.64;
      var hs = H - padB - y(d.sent), ho = H - padB - y(d.opened);
      svg += '<g class="bgrp" data-i="' + i + '">' +
        '<rect x="' + (padL + i * bw) + '" y="' + padT + '" width="' + bw + '" height="' + (H - padB - padT) + '" fill="transparent"/>' +
        '<rect class="bar" x="' + x + '" y="' + (H - padB) + '" width="' + w + '" height="0" rx="6" fill="url(#gSent)" data-y="' + y(d.sent) + '" data-h="' + hs + '"/>' +
        '<rect class="bar" x="' + (x + w * 0.2) + '" y="' + (H - padB) + '" width="' + (w * 0.6) + '" height="0" rx="4" style="fill:var(--success)" opacity=".9" data-y="' + y(d.opened) + '" data-h="' + ho + '"/>' +
        '</g>';
      if (i % 2 === 0 || days.length <= 8) {
        var dt = new Date(d.date + 'T12:00:00');
        svg += '<text x="' + (x + w / 2) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="11" style="fill:var(--text-3)">' + dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</text>';
      }
    });
    svg += '<defs><linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--primary-2)"/><stop offset="1" style="stop-color:var(--primary)"/></linearGradient></defs></svg>';
    el.innerHTML = svg;
    requestAnimationFrame(function () {
      setTimeout(function () {
        $$('.bar', el).forEach(function (b, i) {
          b.style.transitionDelay = (i * 0.018) + 's';
          b.setAttribute('y', b.getAttribute('data-y'));
          b.setAttribute('height', Math.max(0, b.getAttribute('data-h')));
        });
      }, 60);
    });
    var tip = MP.el('<div class="chart-tip" style="opacity:0"></div>');
    document.body.appendChild(tip);
    $$('.bgrp', el).forEach(function (g) {
      g.addEventListener('mousemove', function (e) {
        var d = days[+g.getAttribute('data-i')];
        tip.innerHTML = '<b>' + new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + '</b><br>' +
          MP.num(d.sent) + ' sent · ' + MP.num(d.opened) + ' opened';
        tip.style.opacity = '1';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 40) + 'px';
      });
      g.addEventListener('mouseleave', function () { tip.style.opacity = '0'; });
    });
    return function () { tip.remove(); };
  }

  function ring(pctVal, size, stroke, color) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return '<svg class="ring" width="' + size + '" height="' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" style="stroke:var(--surface-3)" stroke-width="' + stroke + '" fill="none"/>' +
      '<circle class="ring-val" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" style="stroke:' + (color || 'var(--primary)') + '" stroke-width="' + stroke + '" fill="none" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" data-off="' + (c * (1 - Math.min(1, pctVal / 100))) + '"/></svg>';
  }
  MP.ring = ring;
  MP.animateRings = function (root) {
    requestAnimationFrame(function () {
      setTimeout(function () { $$('.ring-val', root).forEach(function (c) { c.style.strokeDashoffset = c.getAttribute('data-off'); }); }, 80);
    });
  };

  MP.campaignRow = function (c) {
    var s = c.stats || {};
    var live = c.status === 'sending';
    var right = c.status === 'draft'
      ? '<div class="lr-stat"><b>—</b>draft</div>'
      : '<div class="lr-stat"><b>' + MP.num(s.sent) + '</b>sent</div><div class="lr-stat"><b>' + MP.pct(s.open_rate) + '</b>opened</div>';
    return '<div class="list-row" data-go="/campaigns/' + c.id + (c.status === 'draft' ? '/edit' : '') + '">' +
      '<div class="lr-ico">' + icon(c.status === 'draft' ? 'edit' : 'send') + '</div>' +
      '<div class="lr-main"><b class="trunc">' + esc(c.name) + '</b><span class="row" style="gap:8px">' + MP.badge(c.status) +
      (live ? '<span class="progress live" style="width:90px;height:6px"><i style="width:' + (s.progress || 0) + '%"></i></span>' : '<span class="trunc">' + esc(c.subject || 'No subject') + '</span>') + '</span></div>' +
      right + '</div>';
  };

  MP.route('/', function (el, params, ctx) {
    MP.setCrumbs([{ label: 'Dashboard' }]);
    el.innerHTML = MP.skeleton(4);
    var tz = -new Date().getTimezoneOffset();
    var cleanupChart = null;
    var timer = null;

    function load(first) {
      return MP.api('dashboard', { tz_offset: tz }).then(function (d) {
        if (!ctx.alive()) return;
        draw(d, first);
        clearTimeout(timer);
        if (d.engine.sending_campaigns > 0) timer = setTimeout(function () { load(false); }, 15000);
      });
    }

    function draw(d, first) {
      var k = d.kpis, ck = d.checklist, e = d.engine;
      var hour = new Date().getHours();
      var greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      var steps = [
        { done: ck.smtp, title: 'Connect your mailbox', sub: 'SMTP for marketing@', go: '/settings/sender' },
        { done: ck.test_sent, title: 'Send a test email', sub: 'Make sure delivery works', go: '/settings/sender' },
        { done: ck.cron, title: 'Set up the cron job', sub: 'Sends in the background', go: '/settings/cron' },
        { done: ck.bounces, title: 'Enable bounce tracking', sub: 'Detect dead addresses', go: '/settings/bounces' },
        { done: ck.address, title: 'Add your postal address', sub: 'Required by anti-spam law', go: '/settings/general' },
        { done: ck.house, title: 'Fill an Email House', sub: 'Import your contacts', go: '/houses' },
        { done: ck.campaign, title: 'Launch a campaign', sub: 'The fun part 🚀', go: '/campaigns/new' }
      ];
      var doneCount = steps.filter(function (s) { return s.done; }).length;
      var showChecklist = doneCount < steps.length && !MP.store.get('hide-checklist', false);
      var limit = e.hourly_limit || 0;
      var used = limit ? e.sent_last_hour / limit * 100 : 0;

      el.innerHTML =
        '<div class="page-head"><div><div class="hello">' + greet + ', ' + esc(MP.state.user.username) + ' <span class="wave">👋</span></div>' +
        '<p>Here is what is happening with your email marketing.</p></div>' +
        '<div class="actions"><button class="btn" data-go="/houses">' + icon('users') + '<span>Contacts</span></button>' +
        '<button class="btn primary" data-go="/campaigns/new">' + icon('plus') + '<span>New campaign</span></button></div></div>' +

        (showChecklist ?
          '<div class="card pad mb-16" style="animation:rise .5s var(--ease) both"><div class="row" style="margin-bottom:16px">' +
          '<div style="position:relative;width:52px;height:52px">' + ring(doneCount / steps.length * 100, 52, 6, 'var(--success)') +
          '<b style="position:absolute;inset:0;display:grid;place-items:center;font-size:13px">' + doneCount + '/' + steps.length + '</b></div>' +
          '<div><h3 style="font-size:17px">Let\'s get you set up</h3><div class="hint">Finish these steps to start sending like a pro.</div></div>' +
          '<span class="spacer"></span><button class="btn ghost sm" id="hideCk">Hide</button></div>' +
          '<div class="checklist">' + steps.map(function (s) {
            return '<div class="check-item ' + (s.done ? 'done' : '') + '" data-go="' + s.go + '"><div class="ci">' + (s.done ? icon('check') : '') + '</div><div><b>' + esc(s.title) + '</b><span>' + esc(s.sub) + '</span></div></div>';
          }).join('') + '</div></div>' : '') +

        '<div class="kpis stagger">' +
        kpi('primary', 'users', 'Active contacts', k.contacts_active, '<b>' + MP.num(k.contacts) + '</b> total in ' + MP.plural(k.houses, 'house'), { go: '/houses' }) +
        kpi('info', 'send', 'Emails sent', k.sent_30d, 'Last 30 days', { go: '/campaigns' }) +
        kpi('success', 'eye', 'Open rate', k.open_rate, 'Unique opens, 30 days', { dec: 1, suffix: '%' }) +
        kpi('warning', 'pointer', 'Click rate', k.click_rate, 'Unique clicks, 30 days', { dec: 1, suffix: '%' }) +
        kpi('danger', 'bounce', 'Bounce rate', k.bounce_rate, 'Keep it under 2%', { dec: 1, suffix: '%' }) +
        kpi('pink', 'shield', 'Suppressed', k.suppressed, 'Never emailed again', { go: '/suppression' }) +
        '</div>' +

        '<div class="dash-grid">' +
        '<div class="card" style="animation:rise .6s .1s var(--ease) both"><div class="card-head"><div><h3>Sending activity</h3><p>Emails sent and opened over the last 14 days</p></div><span class="spacer"></span>' +
        '<div class="legend"><span><i style="background:var(--primary)"></i>Sent</span><span><i style="background:var(--success)"></i>Opened</span></div></div>' +
        '<div class="card-body" id="chart" style="padding:18px 14px 8px"></div></div>' +

        '<div class="card" style="animation:rise .6s .16s var(--ease) both"><div class="card-head"><div><h3>Sending engine</h3><p>Hourly limit protects your mailbox</p></div></div>' +
        '<div class="card-body"><div class="row" style="gap:20px"><div style="position:relative;width:120px;height:120px;flex:none">' + ring(used, 120, 12) +
        '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><b style="font-size:24px;font-weight:800">' + MP.num(e.sent_last_hour) + '</b>' +
        '<div class="hint">of ' + (limit ? MP.num(limit) : '∞') + ' / hour</div></div></div></div>' +
        '<div class="stack" style="gap:10px;flex:1;min-width:0">' +
        '<div class="row"><span class="pulse ' + (e.sending_campaigns ? 'on' : '') + '"></span><b>' + (e.sending_campaigns ? MP.plural(e.sending_campaigns, 'campaign') + ' sending' : 'Nothing sending') + '</b></div>' +
        '<div class="hint">' + MP.num(e.pending) + ' emails in the queue' + (e.pending && limit ? ' · ≈ ' + MP.duration(e.pending / limit * 3600) + ' to go' : '') + '</div>' +
        '<div class="row"><span class="pulse ' + (e.cron_ok ? 'on' : 'warn') + '"></span><span>' + (e.cron_ok ? 'Cron active (' + MP.ago(e.cron_last_run) + ')' : (e.cron_last_run ? 'Cron last ran ' + MP.ago(e.cron_last_run) : 'Cron job not set up')) + '</span></div>' +
        '<div class="hint">' + MP.num(e.sent_last_day) + ' emails in the last 24h</div>' +
        (e.cron_ok ? '' : '<button class="btn soft sm" data-go="/settings/cron" style="align-self:flex-start">' + icon('clock') + '<span>Set up cron</span></button>') +
        '</div></div></div></div>' +
        '</div>' +

        '<div class="card mt-16" style="animation:rise .6s .22s var(--ease) both"><div class="card-head"><div><h3>Recent campaigns</h3><p>Your latest activity</p></div><span class="spacer"></span>' +
        '<button class="btn ghost sm" data-go="/campaigns"><span>View all</span>' + icon('right') + '</button></div>' +
        (d.recent.length ? d.recent.map(MP.campaignRow).join('') :
          MP.empty('send', 'No campaigns yet', 'Create your first campaign, add your HTML email and pick an Email House to send it to.', '<button class="btn primary" data-go="/campaigns/new">' + icon('plus') + '<span>Create campaign</span></button>')) +
        '</div>';

      $$('[data-go]', el).forEach(function (x) { x.addEventListener('click', function () { MP.go(x.getAttribute('data-go')); }); });
      var hide = $('#hideCk', el);
      if (hide) hide.addEventListener('click', function () {
        MP.store.set('hide-checklist', true);
        var card = hide.closest('.card');
        card.style.transition = 'opacity .3s, transform .3s';
        card.style.opacity = '0';
        card.style.transform = 'scale(.98)';
        setTimeout(function () { card.remove(); }, 300);
      });
      if (cleanupChart) cleanupChart();
      cleanupChart = barChart($('#chart', el), d.daily);
      if (!first) $$('[data-count]', el).forEach(function (n) { n.setAttribute('data-from', n.getAttribute('data-count')); });
      MP.countUp(el);
      MP.animateRings(el);
      if (!first) $$('.stagger > *, .card', el).forEach(function (c) { c.style.animation = 'none'; });
    }

    return load(true).then(function () {
      return function () { clearTimeout(timer); if (cleanupChart) cleanupChart(); };
    });
  }, 'dashboard');
})();
