/* ==========================================================================
   MailPilot — Suppression list & bounce log
   ========================================================================== */
(function () {
  'use strict';
  var MP = window.MP, $ = MP.$, $$ = MP.$$, esc = MP.esc, icon = MP.icon;
  var REASONS = [['', 'All'], ['unsubscribed', 'Unsubscribed'], ['bounced', 'Bounced'], ['invalid', 'Invalid'], ['complained', 'Complained'], ['manual', 'Blocked']];

  MP.route('/suppression', function (el, params, ctx) { return view(el, 'list', ctx); }, 'suppression');
  MP.route('/suppression/bounces', function (el, params, ctx) { return view(el, 'bounces', ctx); }, 'suppression');

  function view(el, tab, ctx) {
    MP.setCrumbs([{ label: 'Suppression' }]);
    var st = { reason: '', q: '', page: 1, type: '' };
    el.innerHTML =
      '<div class="page-head"><div><h1>Suppression</h1><p>Addresses that will never be emailed again — protecting your sender reputation automatically.</p></div>' +
      '<div class="actions" id="sActions"></div></div>' +
      '<div class="tabs mb-16" id="sTabs"><button data-tab="list"' + (tab === 'list' ? ' class="on"' : '') + '>' + icon('shield') + 'Suppression list</button>' +
      '<button data-tab="bounces"' + (tab === 'bounces' ? ' class="on"' : '') + '>' + icon('inbox') + 'Bounce & reply log</button></div>' +
      '<div id="sBody"></div>';
    MP.tabs($('#sTabs', el), function (v) {
      tab = v;
      MP.replacePath(v === 'list' ? '/suppression' : '/suppression/bounces');
      render();
    });

    function render() {
      var body = $('#sBody', el);
      body.innerHTML = '<div class="pane"></div>';
      if (tab === 'list') list(body.firstElementChild); else bounces(body.firstElementChild);
    }

    function list(p) {
      $('#sActions', el).innerHTML = '<button class="btn" id="sExp">' + icon('download') + '<span>Export</span></button><button class="btn primary" id="sAdd">' + icon('plus') + '<span>Block addresses</span></button>';
      $('#sExp', el).addEventListener('click', function () { MP.download('suppression.export'); });
      $('#sAdd', el).addEventListener('click', add);
      p.innerHTML = '<div class="kpis stagger mb-16" id="sK"></div><div class="card"><div class="toolbar"><div class="pills" id="sPills"></div><span class="spacer"></span>' +
        '<div class="input-icon">' + icon('search') + '<input class="input" id="sQ" placeholder="Search email…"></div></div><div class="table-wrap" id="sRows"></div><div id="sPager"></div></div>';
      $('#sQ', p).addEventListener('input', MP.debounce(function () { st.q = this.value; st.page = 1; load(); }, 300));
      $('#sPills', p).addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]'); if (!b) return;
        st.reason = b.getAttribute('data-r'); st.page = 1; load();
      });
      var first = true;
      function load() {
        return MP.api('suppression.list', st).then(function (r) {
          if (!ctx.alive()) return;
          var total = Object.keys(r.counts).reduce(function (a, k) { return a + r.counts[k]; }, 0);
          if (first) {
            first = false;
            $('#sK', p).innerHTML =
              MP.kpi('pink', 'userx', 'Unsubscribed', r.counts.unsubscribed, 'Clicked unsubscribe or replied') +
              MP.kpi('danger', 'bounce', 'Hard bounced', r.counts.bounced, 'Mailbox does not exist') +
              MP.kpi('info', 'mailx', 'Invalid', r.counts.invalid, 'Bad format / dead domain') +
              MP.kpi('warning', 'flag', 'Complaints', r.counts.complained, 'Marked as spam') +
              MP.kpi('slate', 'ban', 'Blocked', r.counts.manual, 'Added by you');
            MP.countUp(p);
          }
          $('#sPills', p).innerHTML = REASONS.map(function (x) {
            return '<button class="pill' + (st.reason === x[0] ? ' on' : '') + '" data-r="' + x[0] + '">' + x[1] + ' <span class="n">' + MP.num(x[0] ? r.counts[x[0]] : total) + '</span></button>';
          }).join('');
          var box = $('#sRows', p);
          box.innerHTML = r.rows.length ? '<table class="table"><thead><tr><th>Email</th><th>Reason</th><th>Details</th><th>Since</th><th></th></tr></thead><tbody>' +
            r.rows.map(function (x) {
              return '<tr><td class="t-email">' + esc(x.email) + '</td><td>' + MP.badge(x.reason) + '</td><td><div class="t-sub trunc" style="max-width:380px" title="' + esc(x.detail) + '">' + esc(x.detail || '—') + (x.campaign ? ' · ' + esc(x.campaign) : '') + '</div></td>' +
                '<td class="t-sub nowrap">' + MP.ago(x.created_at) + '</td><td style="text-align:right"><button class="btn ghost sm" data-rm="' + esc(x.email) + '">Remove</button></td></tr>';
            }).join('') + '</tbody></table>'
            : MP.empty('shield', st.q || st.reason ? 'Nothing found' : 'Your suppression list is empty', 'Unsubscribes, hard bounces, invalid addresses and spam complaints are added here automatically.');
          $$('[data-rm]', box).forEach(function (b) {
            b.addEventListener('click', function () {
              var email = b.getAttribute('data-rm');
              MP.confirm({ title: 'Allow emails to ' + email + ' again?', text: 'Only do this if you are sure the person wants your emails and the address works. Emailing unsubscribed or dead addresses damages your sender reputation.', confirmLabel: 'Remove from list' })
                .then(function (ok) {
                  if (!ok) return;
                  MP.api('suppression.remove', { emails: [email] }).then(function () {
                    var tr = b.closest('tr');
                    tr.style.transition = 'all .3s'; tr.style.opacity = '0';
                    MP.toast(email + ' can receive emails again');
                    setTimeout(load, 300);
                  }).catch(function (e) { MP.toast(e.message, 'error'); });
                });
            });
          });
          var pg = $('#sPager', p);
          pg.innerHTML = '';
          if (r.total) pg.appendChild(MP.pager(r, function (n) { st.page = n; load(); }));
        });
      }
      function add() {
        MP.modal({
          title: 'Block email addresses', icon: 'ban',
          text: 'These addresses will never receive a campaign, in any Email House.',
          body: '<div class="stack"><textarea class="textarea code" id="blk" rows="8" placeholder="one@example.com\ntwo@example.com"></textarea><input class="input" id="blkNote" placeholder="Note (optional), e.g. Asked not to be contacted"></div>',
          actions: [{ label: 'Cancel', cls: 'ghost' }, {
            label: 'Block', cls: 'primary', onClick: function (m) {
              return MP.api('suppression.add', { emails: $('#blk', m.el).value, note: $('#blkNote', m.el).value }).then(function (r) {
                MP.toast(MP.plural(r.added, 'address', 'addresses') + ' blocked' + (r.invalid ? ' · ' + r.invalid + ' invalid ignored' : ''));
                first = true;
                load();
              });
            }
          }]
        });
      }
      return load();
    }

    function bounces(p) {
      $('#sActions', el).innerHTML = '<button class="btn primary" id="chk">' + icon('refresh') + '<span>Check mailbox now</span></button>';
      p.innerHTML = '<div id="bInfo" class="mb-16"></div><div class="card"><div class="toolbar"><div class="pills" id="bPills"></div></div><div class="table-wrap" id="bRows"></div><div id="bPager"></div></div>';
      $('#chk', el).addEventListener('click', function () {
        MP.busy(this, function () {
          return MP.api('bounces.check', {}).then(function (r) {
            var s = r.summary;
            MP.toast('Scanned ' + MP.plural(s.scanned, 'new message') + ': ' + s.hard + ' hard, ' + s.soft + ' soft bounces, ' + s.complaints + ' complaints, ' + s.unsubscribes + ' unsubscribe replies', 'success', 6000);
            st.page = 1;
            return load();
          });
        }).catch(function () {});
      });
      $('#bPills', p).addEventListener('click', function (e) {
        var b = e.target.closest('[data-t]'); if (!b) return;
        st.type = b.getAttribute('data-t'); st.page = 1; load();
      });
      function load() {
        return MP.api('bounces.list', st).then(function (r) {
          if (!ctx.alive()) return;
          $('#bInfo', p).innerHTML = r.enabled
            ? '<div class="status-line"><span class="pulse on"></span><div class="grow" style="flex:1"><b>Bounce processing is on.</b> <span class="muted">The mailbox is checked automatically every ~10 minutes by the cron job. Last check: ' + (r.last_check ? MP.ago(r.last_check) : 'never') + '.</span></div></div>'
            : '<div class="alert warn">' + icon('alert') + '<div class="grow"><b>Bounce processing is off.</b> Without it, addresses that no longer exist (bounces arriving later by email) are not detected. <a href="#/settings/bounces">Turn it on in Settings →</a></div></div>';
          $('#bPills', p).innerHTML = [['', 'All'], ['hard', 'Hard bounces'], ['soft', 'Soft bounces'], ['complaint', 'Complaints'], ['unsubscribe', 'Unsubscribe replies']].map(function (x) {
            return '<button class="pill' + (st.type === x[0] ? ' on' : '') + '" data-t="' + x[0] + '">' + x[1] + '</button>';
          }).join('');
          var box = $('#bRows', p);
          box.innerHTML = r.rows.length ? '<table class="table"><thead><tr><th>Received</th><th>Email</th><th>Type</th><th>Reason</th><th>Campaign</th></tr></thead><tbody>' +
            r.rows.map(function (x) {
              return '<tr><td class="t-sub nowrap">' + MP.date(x.received_at) + '</td><td class="t-email">' + esc(x.email) + '</td><td>' + MP.badge(x.type) + '</td>' +
                '<td><div class="t-sub trunc" style="max-width:420px" title="' + esc(x.diagnostic) + '">' + (x.code ? '<b>' + esc(x.code) + '</b> ' : '') + esc(x.diagnostic || x.subject) + '</div></td>' +
                '<td class="t-sub">' + (x.campaign_id ? '<a href="#/campaigns/' + x.campaign_id + '">' + esc(x.campaign || '#' + x.campaign_id) + '</a>' : '—') + '</td></tr>';
            }).join('') + '</tbody></table>'
            : MP.empty('inbox', 'No bounces recorded', 'When an email cannot be delivered, the receiving server sends a bounce message to your mailbox. MailPilot reads those and lists them here.');
          var pg = $('#bPager', p);
          pg.innerHTML = '';
          if (r.total) pg.appendChild(MP.pager(r, function (n) { st.page = n; load(); }));
        });
      }
      return load();
    }

    render();
  }
})();
