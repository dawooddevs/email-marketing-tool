/* ==========================================================================
   MailPilot — Email Houses (lists) and contacts
   ========================================================================== */
(function () {
  'use strict';
  var MP = window.MP, $ = MP.$, $$ = MP.$$, esc = MP.esc, icon = MP.icon;
  var COLORS = ['violet', 'blue', 'teal', 'green', 'amber', 'rose', 'pink', 'slate'];
  var STATUSES = [
    ['', 'All', 'total'], ['active', 'Active', 'active'], ['unsubscribed', 'Unsubscribed', 'unsubscribed'],
    ['bounced', 'Bounced', 'bounced'], ['invalid', 'Invalid', 'invalid'], ['complained', 'Complained', 'complained']
  ];

  function houseForm(h) {
    h = h || { name: '', description: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    return '<div class="stack">' +
      '<div class="field"><label>Name</label><input class="input" name="name" maxlength="150" value="' + esc(h.name) + '" placeholder="e.g. Newsletter subscribers"></div>' +
      '<div class="field"><label>Description <span class="faint" style="font-weight:500">(optional)</span></label><input class="input" name="description" maxlength="255" value="' + esc(h.description) + '" placeholder="Where these contacts came from"></div>' +
      '<div class="field"><label>Colour</label><div class="swatches">' + COLORS.map(function (c) {
        return '<button type="button" class="swatch hc-' + c + (c === h.color ? ' on' : '') + '" data-color="' + c + '"></button>';
      }).join('') + '</div></div></div>';
  }
  function bindSwatches(root) {
    $$('.swatch', root).forEach(function (s) {
      s.addEventListener('click', function () { $$('.swatch', root).forEach(function (x) { x.classList.toggle('on', x === s); }); });
    });
  }
  function readForm(root) {
    var on = $('.swatch.on', root);
    return { name: $('[name=name]', root).value, description: $('[name=description]', root).value, color: on ? on.getAttribute('data-color') : 'violet' };
  }

  MP.editHouse = function (h, onSaved) {
    MP.modal({
      title: h ? 'Edit Email House' : 'New Email House',
      icon: 'house',
      text: h ? '' : 'An Email House is a list of email addresses you can send campaigns to.',
      body: houseForm(h),
      onOpen: function (m) { bindSwatches(m.el); },
      actions: [
        { label: 'Cancel', cls: 'ghost' },
        {
          label: h ? 'Save changes' : 'Create house', cls: 'primary', onClick: function (m) {
            var data = readForm(m.el);
            if (h) data.id = h.id;
            return MP.api('houses.save', data).then(function (r) {
              MP.toast(h ? 'Email House updated' : 'Email House created');
              onSaved && onSaved(r.house);
            });
          }
        }
      ]
    });
  };

  function segBar(h) {
    var t = h.total || 1;
    return '<div class="seg-bar">' +
      '<i style="flex-grow:' + (h.active / t) + ';background:var(--success)"></i>' +
      '<i style="flex-grow:' + (h.unsubscribed / t) + ';background:var(--pink)"></i>' +
      '<i style="flex-grow:' + (h.bounced / t) + ';background:var(--danger)"></i>' +
      '<i style="flex-grow:' + ((h.invalid + h.complained) / t) + ';background:var(--info)"></i></div>';
  }

  /* ------------------------------------------------------------ list */
  MP.route('/houses', function (el, params, ctx) {
    MP.setCrumbs([{ label: 'Email Houses' }]);
    el.innerHTML = MP.skeleton(3);
    function load() {
      return MP.api('houses.list', {}).then(function (r) {
        if (!ctx.alive()) return;
        var hs = r.houses;
        var total = hs.reduce(function (a, h) { return a + h.total; }, 0);
        var active = hs.reduce(function (a, h) { return a + h.active; }, 0);
        el.innerHTML =
          '<div class="page-head"><div><h1>Email Houses</h1><p>Your contact lists — ' + MP.num(total) + ' addresses, ' + MP.num(active) + ' active, across ' + MP.plural(hs.length, 'house') + '.</p></div>' +
          '<div class="actions"><button class="btn primary" id="newH">' + icon('plus') + '<span>New Email House</span></button></div></div>' +
          (hs.length ? '<div class="houses stagger">' + hs.map(function (h) {
            return '<div class="card hover house hc-' + esc(h.color) + '" data-id="' + h.id + '">' +
              '<div class="h-top"><div class="h-icon">' + icon('house') + '</div><button class="btn icon sm h-menu" data-menu="' + h.id + '">' + icon('more') + '</button></div>' +
              '<div class="h-body"><h3 class="trunc">' + esc(h.name) + '</h3><p class="trunc">' + esc(h.description || '') + '</p>' +
              '<div class="h-count"><b data-count="' + h.total + '">0</b><span>contacts</span></div>' + segBar(h) +
              '<div class="row mt-8" style="gap:14px;font-size:12.5px;color:var(--text-3)"><span><b style="color:var(--success)">' + MP.num(h.active) + '</b> active</span>' +
              (h.unsubscribed ? '<span><b style="color:var(--pink)">' + MP.num(h.unsubscribed) + '</b> unsub.</span>' : '') +
              (h.bounced ? '<span><b style="color:var(--danger)">' + MP.num(h.bounced) + '</b> bounced</span>' : '') +
              (h.invalid ? '<span><b style="color:var(--info)">' + MP.num(h.invalid) + '</b> invalid</span>' : '') + '</div></div>' +
              '<div class="h-foot">' + icon('clock', 'ico').replace('class="ico"', 'class="ico" style="width:14px;height:14px"') + '<span>Updated ' + MP.ago(h.updated_at) + '</span><span class="spacer"></span>' +
              '<button class="btn soft sm" data-add="' + h.id + '">' + icon('plus') + '<span>Add contacts</span></button></div></div>';
          }).join('') + '</div>'
            : '<div class="card">' + MP.empty('house', 'Create your first Email House', 'Group your email addresses into houses (lists) — e.g. "Customers", "Newsletter", "Leads". You can paste thousands of addresses or upload a CSV file.',
              '<button class="btn primary" id="newH2">' + icon('plus') + '<span>New Email House</span></button>') + '</div>');
        MP.countUp(el);
        var create = function () { MP.editHouse(null, function (h) { MP.go('/houses/' + h.id); }); };
        $('#newH', el).addEventListener('click', create);
        if ($('#newH2', el)) $('#newH2', el).addEventListener('click', create);
        $$('.house', el).forEach(function (card) {
          var id = +card.getAttribute('data-id');
          var h = hs.filter(function (x) { return x.id === id; })[0];
          card.addEventListener('click', function (e) {
            var m = e.target.closest('[data-menu]');
            var a = e.target.closest('[data-add]');
            if (m) {
              e.stopPropagation();
              MP.dropdown(m, [
                { label: 'Open', icon: 'users', onClick: function () { MP.go('/houses/' + id); } },
                { label: 'Edit', icon: 'edit', onClick: function () { MP.editHouse(h, load); } },
                { label: 'Export CSV', icon: 'download', onClick: function () { MP.download('house.export', { list_id: id }); } },
                '-',
                { label: 'Delete house', icon: 'trash', danger: true, onClick: function () { MP.deleteHouse(h, load); } }
              ]);
              return;
            }
            if (a) { e.stopPropagation(); MP.addContacts(h, load); return; }
            MP.go('/houses/' + id);
          });
        });
      });
    }
    return load();
  }, 'houses');

  MP.deleteHouse = function (h, done) {
    MP.confirm({
      title: 'Delete "' + h.name + '"?', danger: true, confirmLabel: 'Delete house',
      text: 'All <b>' + MP.num(h.total) + '</b> contacts in this house will be deleted. Campaign reports keep their statistics. Unsubscribes and bounces stay on the suppression list.'
    }).then(function (ok) {
      if (!ok) return;
      MP.api('houses.delete', { id: h.id }).then(function () { MP.toast('Email House deleted'); done && done(); }).catch(function (e) { MP.toast(e.message, 'error'); });
    });
  };

  /* ------------------------------------------------------------ add contacts drawer */
  MP.addContacts = function (h, done) {
    var tab = 'paste', file = null;
    var body = MP.el('<div>' +
      '<div class="tabs mb-16" id="acTabs"><button data-tab="paste" class="on">' + icon('list') + 'Paste list</button><button data-tab="csv">' + icon('upload') + 'Upload CSV</button><button data-tab="single">' + icon('plus') + 'Single</button></div>' +
      '<div data-pane="paste"><div class="field"><label>Email addresses <span class="counter" id="pasteCount">0 detected</span></label>' +
      '<textarea class="textarea code" id="pasteBox" rows="14" placeholder="One per line. These formats all work:\njohn@example.com\nJane Doe <jane@example.com>\nmark@example.com, Mark Smith\nSara Lee, sara@example.com"></textarea>' +
      '<span class="hint">Paste from Excel, Google Sheets or any text. Invalid addresses and duplicates are filtered out automatically.</span></div></div>' +
      '<div data-pane="csv" class="hidden"><label class="dropzone" id="dz"><input type="file" id="csvFile" accept=".csv,.txt,text/csv,text/plain" class="hidden">' +
      '<div class="dz-ico">' + icon('upload') + '</div><b id="dzTitle">Drop your CSV file here</b><div class="hint" id="dzSub">or click to browse · columns like "email", "name", "first name", "last name" are detected</div></label>' +
      '<div class="hint mt-16">Max upload size on this server: <b id="upMax">…</b>. Very large files? Split them into parts.</div></div>' +
      '<div data-pane="single" class="hidden"><div class="stack"><div class="field"><label>Email</label><input class="input" id="sEmail" type="email" placeholder="name@example.com"></div>' +
      '<div class="field"><label>Name <span class="faint" style="font-weight:500">(optional)</span></label><input class="input" id="sName" placeholder="Full name"></div></div></div>' +
      '<div id="acResult"></div></div>');
    var foot = MP.el('<div class="row" style="width:100%"><span class="hint">Adding to <b>' + esc(h.name) + '</b></span><span class="spacer"></span><button class="btn ghost" data-x>Close</button><button class="btn primary" id="acGo">' + icon('plus') + '<span>Import contacts</span></button></div>');
    var d = MP.drawer({ title: 'Add contacts', subtitle: h.name, icon: 'users', body: body, foot: foot, onClose: function () { done && done(); } });
    $('[data-x]', foot).addEventListener('click', d.close);
    MP.tabs($('#acTabs', body), function (v) {
      tab = v;
      $$('[data-pane]', body).forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-pane') !== v); });
      $('#acGo span', foot).textContent = v === 'single' ? 'Add contact' : 'Import contacts';
    });
    var box = $('#pasteBox', body);
    setTimeout(function () { box.focus(); }, 400);
    box.addEventListener('input', MP.debounce(function () {
      var m = box.value.match(/[^\s,;<>"'()]+@[^\s,;<>"'()]+\.[a-z]{2,}/gi) || [];
      var uniq = {};
      m.forEach(function (e) { uniq[e.toLowerCase()] = 1; });
      $('#pasteCount', body).textContent = MP.num(Object.keys(uniq).length) + ' detected';
    }, 150));
    MP.api('settings.get', {}).then(function (s) { $('#upMax', body).textContent = s.server.upload_max; }).catch(function () { $('#upMax', body).textContent = 'unknown'; });
    var dz = $('#dz', body), input = $('#csvFile', body);
    function setFile(f) {
      file = f;
      dz.classList.toggle('has-file', !!f);
      $('#dzTitle', body).textContent = f ? f.name : 'Drop your CSV file here';
      $('#dzSub', body).textContent = f ? (f.size / 1024 < 1024 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB') + ' · ready to import' : 'or click to browse';
      $('.dz-ico', dz).innerHTML = icon(f ? 'file' : 'upload');
    }
    input.addEventListener('change', function () { setFile(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

    $('#acGo', foot).addEventListener('click', function () {
      var btn = this;
      var res = $('#acResult', body);
      MP.busy(btn, function () {
        if (tab === 'single') {
          return MP.api('contacts.add', { list_id: h.id, email: $('#sEmail', body).value, name: $('#sName', body).value }).then(function (r) {
            MP.toast(r.suppressed ? 'Added — but this address is on the suppression list, so it will not be emailed.' : 'Contact added', r.suppressed ? 'warn' : 'success');
            $('#sEmail', body).value = '';
            $('#sName', body).value = '';
            $('#sEmail', body).focus();
          });
        }
        var req;
        if (tab === 'csv') {
          if (!file) throw new Error('Choose a CSV file first.');
          var fd = new FormData();
          fd.append('list_id', h.id);
          fd.append('file', file);
          req = MP.api('contacts.import', fd);
        } else {
          req = MP.api('contacts.import', { list_id: h.id, text: box.value });
        }
        res.innerHTML = '<div class="card pad mt-16" style="text-align:center"><span class="spinner"></span><div class="hint mt-8">Importing and validating… large lists can take a moment.</div></div>';
        return req.then(function (r) {
          var s = r.stats;
          res.innerHTML = '<div class="section-title">Import result</div><div class="result-grid">' +
            '<div class="result-tile"><b style="color:var(--success)" data-count="' + s.added + '">0</b><span>New contacts added</span></div>' +
            '<div class="result-tile"><b data-count="' + s.duplicates + '">0</b><span>Duplicates skipped</span></div>' +
            '<div class="result-tile"><b style="color:var(--danger)" data-count="' + s.invalid + '">0</b><span>Invalid addresses</span></div>' +
            '<div class="result-tile"><b style="color:var(--pink)" data-count="' + s.suppressed + '">0</b><span>On suppression list</span></div></div>' +
            (s.invalid_samples.length ? '<div class="section-title">Invalid entries (not imported)</div><div class="samples">' + s.invalid_samples.map(esc).join('<br>') + (s.invalid > s.invalid_samples.length ? '<br>… and ' + MP.num(s.invalid - s.invalid_samples.length) + ' more' : '') + '</div>' : '') +
            '<div class="alert info mt-16">' + icon('info') + '<div class="grow">Tip: run <b>Verify domains</b> on the house to find addresses whose domain no longer exists before you send.</div></div>';
          MP.countUp(res);
          if (tab === 'paste') box.value = '';
          if (tab === 'csv') setFile(null);
          MP.toast(MP.num(s.added) + ' contacts added to ' + h.name);
        });
      }).catch(function () { res.innerHTML = ''; });
    });
  };

  /* ------------------------------------------------------------ house detail */
  MP.route('/houses/:id', function (el, params, ctx) {
    var id = +params.id;
    MP.setCrumbs([{ label: 'Email Houses', href: '/houses' }, { label: '…' }]);
    el.innerHTML = MP.skeleton(4);
    var st = { status: '', q: '', page: 1 };
    var house = null, rows = [], selected = {};
    var bulk = MP.el('<div class="bulkbar"><b id="bbN"></b><button class="btn sm" data-b="unsub">' + icon('userx') + '<span>Unsubscribe</span></button>' +
      '<button class="btn sm" data-b="active">' + icon('usercheck') + '<span>Reactivate</span></button><button class="btn sm danger" data-b="delete">' + icon('trash') + '<span>Delete</span></button>' +
      '<button class="btn sm icon" data-b="clear">' + icon('x') + '</button></div>');
    document.body.appendChild(bulk);

    function header() {
      MP.setCrumbs([{ label: 'Email Houses', href: '/houses' }, { label: house.name }]);
      $('#hHead', el).innerHTML =
        '<div style="min-width:0"><div class="row"><span class="dot-c hc-' + esc(house.color) + '" style="width:16px;height:16px;border-radius:6px"></span><h1 class="trunc">' + esc(house.name) + '</h1></div>' +
        '<p>' + (house.description ? esc(house.description) + ' · ' : '') + 'Created ' + MP.date(house.created_at) + '</p></div>' +
        '<div class="actions"><button class="btn" id="verifyBtn">' + icon('checkcircle') + '<span>Verify domains</span></button>' +
        '<button class="btn" id="expBtn">' + icon('download') + '<span>Export</span></button>' +
        '<button class="btn icon" id="moreBtn">' + icon('more') + '</button>' +
        '<button class="btn primary" id="addBtn">' + icon('plus') + '<span>Add contacts</span></button></div>';
      $('#addBtn', el).addEventListener('click', function () { MP.addContacts(house, refreshAll); });
      $('#verifyBtn', el).addEventListener('click', verify);
      $('#expBtn', el).addEventListener('click', function () {
        MP.dropdown(this, [{ header: 'Download CSV' }].concat(STATUSES.map(function (s) {
          return { label: s[1] + ' contacts', icon: 'download', onClick: function () { MP.download('house.export', { list_id: id, status: s[0] }); } };
        })));
      });
      $('#moreBtn', el).addEventListener('click', function () {
        MP.dropdown(this, [
          { label: 'Edit house', icon: 'edit', onClick: function () { MP.editHouse(house, function (h) { house = h; header(); pills(); }); } },
          { label: 'Remove inactive contacts', icon: 'wand', onClick: clean },
          '-',
          { label: 'Delete house', icon: 'trash', danger: true, onClick: function () { MP.deleteHouse(house, function () { MP.go('/houses'); }); } }
        ]);
      });
      pills();
    }

    function pills() {
      $('#hPills', el).innerHTML = STATUSES.map(function (s) {
        return '<button class="pill' + (st.status === s[0] ? ' on' : '') + '" data-s="' + s[0] + '">' + s[1] + ' <span class="n">' + MP.num(house[s[2]]) + '</span></button>';
      }).join('');
    }

    function loadRows() {
      var box = $('#hRows', el);
      box.style.opacity = '.5';
      return MP.api('contacts.list', { list_id: id, status: st.status, q: st.q, page: st.page, per: 50 }).then(function (r) {
        if (!ctx.alive()) return;
        house = r.house;
        rows = r.rows;
        box.style.opacity = '';
        if (!rows.length) {
          box.innerHTML = house.total ? MP.empty('search', 'No contacts found', 'Try a different search or filter.')
            : MP.empty('users', 'This house is empty', 'Add email addresses by pasting a list, uploading a CSV file or adding them one by one.', '<button class="btn primary" id="emptyAdd">' + icon('plus') + '<span>Add contacts</span></button>');
          var ea = $('#emptyAdd', box);
          if (ea) ea.addEventListener('click', function () { MP.addContacts(house, refreshAll); });
        } else {
          box.innerHTML = '<table class="table"><thead><tr><th class="w-check"><input type="checkbox" class="check" id="selAll"></th><th>Email</th><th>Name</th><th>Status</th><th>Added</th></tr></thead><tbody>' +
            rows.map(function (c) {
              var tip = c.suppress_detail ? ' data-tip="' + esc(c.suppress_detail.slice(0, 90)) + '"' : '';
              return '<tr data-id="' + c.id + '" class="' + (selected[c.id] ? 'selected' : '') + '"><td class="w-check"><input type="checkbox" class="check" data-sel="' + c.id + '"' + (selected[c.id] ? ' checked' : '') + '></td>' +
                '<td class="t-email">' + esc(c.email) + '</td><td>' + (c.name ? esc(c.name) : '<span class="faint">—</span>') + '</td>' +
                '<td><span' + tip + '>' + MP.badge(c.status) + '</span></td><td class="t-sub nowrap">' + MP.dateShort(c.created_at) + '</td></tr>';
            }).join('') + '</tbody></table>';
        }
        var pg = $('#hPager', el);
        pg.innerHTML = '';
        if (rows.length || st.page > 1) pg.appendChild(MP.pager(r, function (p) { st.page = p; loadRows(); }));
        pills();
        syncBulk();
      }).catch(function (e) { box.style.opacity = ''; MP.toast(e.message, 'error'); });
    }

    function refreshAll() {
      return MP.api('house.get', { id: id }).then(function (r) { house = r.house; header(); return loadRows(); });
    }

    function syncBulk() {
      var n = Object.keys(selected).length;
      bulk.classList.toggle('show', n > 0);
      $('#bbN', bulk).textContent = MP.plural(n, 'selected', 'selected');
      var all = $('#selAll', el);
      if (all) {
        var onPage = rows.filter(function (r) { return selected[r.id]; }).length;
        all.checked = onPage > 0 && onPage === rows.length;
        all.indeterminate = onPage > 0 && onPage < rows.length;
      }
    }

    bulk.addEventListener('click', function (e) {
      var b = e.target.closest('[data-b]');
      if (!b) return;
      var ids = Object.keys(selected).map(Number);
      var act = b.getAttribute('data-b');
      if (act === 'clear') { selected = {}; $$('[data-sel]', el).forEach(function (c) { c.checked = false; c.closest('tr').classList.remove('selected'); }); syncBulk(); return; }
      var run = function (action, data, msg) {
        return MP.busy(b, function () {
          return MP.api(action, Object.assign({ list_id: id, ids: ids }, data)).then(function () {
            MP.toast(msg);
            selected = {};
            return refreshAll();
          });
        }).catch(function () {});
      };
      if (act === 'delete') {
        MP.confirm({ title: 'Delete ' + MP.plural(ids.length, 'contact') + '?', text: 'They will be removed from this house. This cannot be undone.', danger: true, confirmLabel: 'Delete' })
          .then(function (ok) { if (ok) run('contacts.delete', {}, MP.plural(ids.length, 'contact') + ' deleted'); });
      } else if (act === 'unsub') {
        run('contacts.setStatus', { status: 'unsubscribed' }, 'Unsubscribed — they will not receive campaigns');
      } else if (act === 'active') {
        MP.confirm({ title: 'Reactivate ' + MP.plural(ids.length, 'contact') + '?', text: 'They will be removed from the global suppression list and can receive campaigns again. Only do this if they really want your emails — emailing bounced or unsubscribed addresses hurts your sender reputation.', confirmLabel: 'Reactivate' })
          .then(function (ok) { if (ok) run('contacts.setStatus', { status: 'active' }, 'Contacts reactivated'); });
      }
    });

    function clean() {
      var n = house.total - house.active;
      if (!n) { MP.toast('All contacts are active — nothing to clean up', 'info'); return; }
      MP.confirm({ title: 'Remove ' + MP.plural(n, 'inactive contact') + '?', danger: true, confirmLabel: 'Remove',
        text: 'Unsubscribed, bounced, invalid and complained contacts will be deleted from this house. They stay on the global suppression list, so they will never be emailed by mistake.' })
        .then(function (ok) {
          if (!ok) return;
          MP.api('house.clean', { list_id: id }).then(function (r) { MP.toast(MP.num(r.deleted) + ' contacts removed'); refreshAll(); }).catch(function (e) { MP.toast(e.message, 'error'); });
        });
    }

    function verify() {
      var stop = false, checked = 0, invalid = [], marked = 0;
      var m = MP.modal({
        title: 'Verifying email domains', icon: 'checkcircle', dismissable: false,
        text: 'Checking that every domain in this house exists and can receive email. Addresses on dead domains are marked <b>invalid</b> and suppressed.',
        body: '<div class="stack"><div class="row"><b id="vTxt">Starting…</b><span class="spacer"></span><span class="hint" id="vPct">0%</span></div><div class="progress lg live"><i id="vBar" style="width:2%"></i></div>' +
          '<div id="vInvalid" class="hint"></div></div>',
        actions: [{ label: 'Stop', cls: 'ghost', onClick: function () { stop = true; return false; } }]
      });
      function step() {
        if (stop) return finish();
        MP.api('house.verify', { list_id: id }).then(function (r) {
          checked += r.checked;
          invalid = invalid.concat(r.invalid_domains);
          marked = r.marked;
          var total = r.total_domains || 1;
          var done = Math.max(0, total - r.remaining);
          var pctv = Math.min(100, Math.round(done / total * 100));
          $('#vTxt', m.el).textContent = MP.num(done) + ' of ' + MP.num(total) + ' domains checked';
          $('#vPct', m.el).textContent = pctv + '%';
          $('#vBar', m.el).style.width = Math.max(2, pctv) + '%';
          $('#vInvalid', m.el).innerHTML = invalid.length ? '<span style="color:var(--danger)">Dead domains found: ' + invalid.slice(-12).map(esc).join(', ') + (invalid.length > 12 ? '…' : '') + '</span>' : 'No dead domains found so far.';
          if (r.remaining > 0 && r.checked > 0) setTimeout(step, 100);
          else finish(r);
        }).catch(function (e) { MP.toast(e.message, 'error'); finish(); });
      }
      function finish() {
        m.close();
        MP.modal({
          title: 'Verification finished', icon: invalid.length ? 'alert' : 'checkcircle', tone: invalid.length ? 'danger' : '',
          text: invalid.length ? '<b>' + MP.plural(invalid.length, 'dead domain') + '</b> found. ' + MP.plural(marked, 'contact') + ' on those domains are now marked invalid and will be skipped.' : 'Every domain in this house can receive email. 🎉',
          body: invalid.length ? '<div class="samples">' + invalid.map(esc).join('<br>') + '</div>' : '',
          actions: [{ label: 'Done', cls: 'primary' }]
        });
        refreshAll();
      }
      step();
    }

    return MP.api('house.get', { id: id }).then(function (r) {
      if (!ctx.alive()) return;
      house = r.house;
      el.innerHTML =
        '<a class="back" href="#/houses">' + icon('left') + '<span>All Email Houses</span></a>' +
        '<div class="page-head" style="margin-top:0" id="hHead"></div>' +
        '<div class="card"><div class="toolbar"><div class="pills" id="hPills"></div><span class="spacer"></span>' +
        '<div class="input-icon">' + icon('search') + '<input class="input" id="hSearch" placeholder="Search email or name…"></div></div>' +
        '<div class="table-wrap" id="hRows" style="transition:opacity .2s"></div><div id="hPager"></div></div>';
      header();
      $('#hPills', el).addEventListener('click', function (e) {
        var p = e.target.closest('[data-s]');
        if (!p) return;
        st.status = p.getAttribute('data-s');
        st.page = 1;
        loadRows();
      });
      $('#hSearch', el).addEventListener('input', MP.debounce(function () { st.q = this.value; st.page = 1; loadRows(); }, 300));
      $('#hRows', el).addEventListener('change', function (e) {
        var c = e.target;
        if (c.id === 'selAll') {
          rows.forEach(function (r) { if (c.checked) selected[r.id] = 1; else delete selected[r.id]; });
          $$('[data-sel]', el).forEach(function (x) { x.checked = c.checked; x.closest('tr').classList.toggle('selected', c.checked); });
        } else if (c.hasAttribute('data-sel')) {
          var cid = +c.getAttribute('data-sel');
          if (c.checked) selected[cid] = 1; else delete selected[cid];
          c.closest('tr').classList.toggle('selected', c.checked);
        }
        syncBulk();
      });
      $('#hRows', el).addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-id]');
        if (!tr || e.target.closest('input')) return;
        var cb = $('[data-sel]', tr);
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return loadRows();
    }).then(function () {
      return function () { bulk.classList.remove('show'); setTimeout(function () { bulk.remove(); }, 400); };
    });
  }, 'houses');
})();
