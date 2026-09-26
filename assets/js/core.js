/* ==========================================================================
   MailPilot — core: helpers, API, UI components, router, shell
   ========================================================================== */
(function () {
  'use strict';

  var MP = (window.MP = window.MP || {});
  var boot = window.MP_BOOT || {};
  var state = (MP.state = { csrf: boot.csrf, user: null, engine: null, appUrl: '', fromEmail: '', fromName: '' });

  /* ------------------------------------------------------------ helpers */
  MP.$ = function (s, r) { return (r || document).querySelector(s); };
  MP.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var $ = MP.$, $$ = MP.$$;
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  MP.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  var esc = MP.esc;
  MP.num = function (n) { return Number(n || 0).toLocaleString(); };
  MP.pct = function (n) { return (Math.round((Number(n) || 0) * 10) / 10) + '%'; };
  MP.plural = function (n, one, many) { return MP.num(n) + ' ' + (Number(n) === 1 ? one : (many || one + 's')); };
  MP.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  MP.date = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  MP.dateShort = function (iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'; };
  MP.duration = function (sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + 's';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h < 48) return h + 'h' + (mm ? ' ' + mm + 'm' : '');
    var d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  };
  MP.ago = function (iso) {
    if (!iso) return 'never';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 0) return 'in ' + MP.duration(-s);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.round(s / 86400) + 'd ago';
    return MP.dateShort(iso);
  };
  MP.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };
  MP.debounce = function (fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };
  MP.initials = function (name) {
    return String(name || '?').trim().split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase() || '?';
  };
  MP.copy = function (text) {
    var done = function () { MP.toast('Copied to clipboard', 'success', 2000); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { MP.toast('Could not copy', 'error'); }
      ta.remove();
    }
  };
  MP.store = {
    get: function (k, d) { try { var v = localStorage.getItem('mp-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('mp-' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ------------------------------------------------------------ events */
  var bus = {};
  MP.on = function (evt, fn) {
    (bus[evt] = bus[evt] || []).push(fn);
    return function () { bus[evt] = (bus[evt] || []).filter(function (f) { return f !== fn; }); };
  };
  MP.emit = function (evt, data) { (bus[evt] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ------------------------------------------------------------ icons (Lucide-style) */
  var P = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
    house: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    more: '<circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/><circle cx="5" cy="12" r="1.3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    mailcheck: '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/>',
    mailx: '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m17 17 4 4M21 17l-4 4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    pointer: '<path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1M5.1 8l-2.9-.8M14 4.1 12 6M6 12l-1.9 2"/>',
    userx: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
    usercheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    play: '<path d="m6 3 14 9-14 9V3z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    split: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    octagon: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><path d="M12 8v4M12 16h.01"/>',
    checkcircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    reply: '<path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    wand: '<path d="m15 4-2 2M17 2v3M20 5h-3M21 9l-2-2M3 21l9-9M12.2 6.2 11 5M17.8 11.8 19 13"/><path d="m14 7 3 3"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
    skip: '<path d="m5 4 10 8-10 8V4zM19 5v14"/>',
    bounce: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
  };
  MP.icon = function (name, cls) {
    return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.info) + '</svg>';
  };
  var icon = MP.icon;

  /* ------------------------------------------------------------ API */
  MP.api = function (action, data, opts) {
    opts = opts || {};
    var headers = { 'X-CSRF-Token': state.csrf || '' };
    var body;
    if (data instanceof FormData) {
      body = data;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data || {});
    }
    return fetch('api.php?a=' + encodeURIComponent(action), { method: 'POST', headers: headers, body: body, credentials: 'same-origin' })
      .catch(function () { throw new Error('Network error — please check your connection.'); })
      .then(function (res) {
        return res.json().catch(function () {
          throw new Error('Unexpected server response (HTTP ' + res.status + '). Check storage/php-errors.log on the server.');
        });
      })
      .then(function (json) {
        if (json.ok) return json;
        if (json.code === 'csrf' && !opts._retried) {
          return MP.api('auth.state', {}, { _retried: true }).then(function (s) {
            state.csrf = s.csrf;
            opts._retried = true;
            return MP.api(action, data, opts);
          });
        }
        if (json.code === 'auth' && !opts.noAuthRedirect && state.user) {
          state.user = null;
          MP.toast('Your session ended — please sign in again.', 'info');
          MP.showLogin();
        }
        var err = new Error(json.error || 'Something went wrong.');
        err.code = json.code;
        throw err;
      });
  };
  MP.download = function (action, params) {
    var q = new URLSearchParams(Object.assign({ a: action, csrf: state.csrf }, params || {}));
    var a = document.createElement('a');
    a.href = 'api.php?' + q.toString();
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
    MP.toast('Your download is starting…', 'info', 2500);
  };
  /** Wraps an async click handler: shows a spinner in the button and toasts errors. */
  MP.busy = function (btn, fn) {
    if (btn) btn.classList.add('loading');
    return Promise.resolve().then(fn).catch(function (e) {
      MP.toast(e.message || String(e), 'error', 6000);
      throw e;
    }).finally(function () { if (btn) btn.classList.remove('loading'); });
  };

  /* ------------------------------------------------------------ toast */
  MP.toast = function (msg, type, ms) {
    type = type || 'success';
    ms = ms || (type === 'error' ? 6000 : 3800);
    var ic = { success: 'check', error: 'x', info: 'info', warn: 'alert' }[type] || 'info';
    var t = MP.el('<div class="toast ' + type + '"><div class="t-ico">' + icon(ic) + '</div><div class="grow">' + esc(msg) + '</div><div class="t-bar" style="animation-duration:' + ms + 'ms"></div></div>');
    $('#toasts').appendChild(t);
    var close = function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); };
    var timer = setTimeout(close, ms);
    t.addEventListener('click', function () { clearTimeout(timer); close(); });
  };

  /* ------------------------------------------------------------ overlays (modal / drawer / dropdown) */
  var layers = [];
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && layers.length) {
      var top = layers[layers.length - 1];
      if (top.dismissable !== false) top.close();
    }
  });

  function overlay(onClick) {
    var o = MP.el('<div class="overlay"></div>');
    if (onClick) o.addEventListener('click', onClick);
    document.body.appendChild(o);
    return o;
  }

  /**
   * MP.modal({ title, text, icon, tone, body, size, actions:[{label, cls, onClick(ctx)}], onOpen(ctx), dismissable })
   * onClick may return false (or a promise resolving to false) to keep the modal open.
   */
  MP.modal = function (o) {
    var ov = overlay();
    var wrap = MP.el('<div class="modal-wrap"><div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true"></div></div>');
    var m = wrap.firstElementChild;
    var head = '<div class="modal-head">' + (o.icon ? '<div class="m-ico ' + (o.tone || '') + '">' + icon(o.icon) + '</div>' : '') +
      '<div class="grow" style="flex:1;min-width:0"><h3>' + esc(o.title || '') + '</h3>' + (o.text ? '<p>' + o.text + '</p>' : '') + '</div>' +
      (o.dismissable === false ? '' : '<button class="btn ghost icon sm x-btn" data-close>' + icon('x') + '</button>') + '</div>';
    m.innerHTML = head + '<div class="modal-body"></div>' + (o.actions && o.actions.length ? '<div class="modal-foot"></div>' : '');
    var bodyEl = $('.modal-body', m);
    if (o.body instanceof Node) bodyEl.appendChild(o.body); else if (o.body) bodyEl.innerHTML = o.body; else bodyEl.remove();
    document.body.appendChild(wrap);
    var closed = false;
    var ctx = {
      el: m,
      dismissable: o.dismissable,
      close: function () {
        if (closed) return;
        closed = true;
        layers = layers.filter(function (l) { return l !== ctx; });
        ov.classList.add('out');
        wrap.classList.add('out');
        setTimeout(function () { ov.remove(); wrap.remove(); }, 220);
        if (o.onClose) o.onClose();
      }
    };
    layers.push(ctx);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap && o.dismissable !== false) ctx.close(); });
    $$('[data-close]', m).forEach(function (b) { b.addEventListener('click', ctx.close); });
    if (o.actions) {
      var foot = $('.modal-foot', m);
      o.actions.forEach(function (a) {
        var b = MP.el('<button class="btn ' + (a.cls || '') + '">' + (a.icon ? icon(a.icon) : '') + '<span>' + esc(a.label) + '</span></button>');
        b.addEventListener('click', function () {
          if (!a.onClick) return ctx.close();
          b.classList.add('loading');
          Promise.resolve().then(function () { return a.onClick(ctx, b); }).then(function (keep) {
            b.classList.remove('loading');
            if (keep !== false) ctx.close();
          }, function (err) {
            b.classList.remove('loading');
            if (err) MP.toast(err.message || String(err), 'error', 6000);
          });
        });
        foot.appendChild(b);
      });
    }
    if (o.onOpen) o.onOpen(ctx);
    var first = $('input:not([type=hidden]), textarea, select', m);
    if (first && o.autofocus !== false) setTimeout(function () { first.focus(); }, 60);
    return ctx;
  };

  MP.confirm = function (o) {
    return new Promise(function (resolve) {
      var answered = false;
      MP.modal({
        title: o.title,
        text: o.text,
        icon: o.icon || (o.danger ? 'alert' : 'info'),
        tone: o.danger ? 'danger' : '',
        body: o.body,
        onClose: function () { if (!answered) resolve(false); },
        actions: [
          { label: o.cancelLabel || 'Cancel', cls: 'ghost' },
          { label: o.confirmLabel || 'Confirm', cls: o.danger ? 'danger' : 'primary', onClick: function () { answered = true; resolve(true); } }
        ]
      });
    });
  };

  MP.drawer = function (o) {
    var ov = overlay(function () { ctx.close(); });
    var d = MP.el('<aside class="drawer ' + (o.cls || '') + '"><div class="drawer-head">' + (o.icon ? '<div class="m-ico" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary)">' + icon(o.icon) + '</div>' : '') +
      '<div style="flex:1;min-width:0"><h3 class="trunc">' + esc(o.title || '') + '</h3>' + (o.subtitle ? '<div class="hint trunc">' + esc(o.subtitle) + '</div>' : '') + '</div>' +
      '<button class="btn ghost icon sm" data-close>' + icon('x') + '</button></div><div class="drawer-body"></div>' + (o.foot ? '<div class="drawer-foot"></div>' : '') + '</aside>');
    var body = $('.drawer-body', d);
    if (o.body instanceof Node) body.appendChild(o.body); else body.innerHTML = o.body || '';
    if (o.foot) { var f = $('.drawer-foot', d); if (o.foot instanceof Node) f.appendChild(o.foot); else f.innerHTML = o.foot; }
    document.body.appendChild(d);
    var closed = false;
    var ctx = {
      el: d,
      body: body,
      close: function () {
        if (closed) return;
        closed = true;
        layers = layers.filter(function (l) { return l !== ctx; });
        ov.classList.add('out');
        d.classList.add('out');
        setTimeout(function () { ov.remove(); d.remove(); }, 260);
        if (o.onClose) o.onClose();
      }
    };
    layers.push(ctx);
    $('[data-close]', d).addEventListener('click', ctx.close);
    if (o.onOpen) o.onOpen(ctx);
    return ctx;
  };

  var openDropdown = null;
  MP.dropdown = function (anchor, items) {
    if (openDropdown) { var same = openDropdown.anchor === anchor; openDropdown.close(); if (same) return; }
    var dd = MP.el('<div class="dropdown"></div>');
    items.forEach(function (it) {
      if (!it) return;
      if (it === '-') { dd.appendChild(MP.el('<hr>')); return; }
      if (it.header) { dd.appendChild(MP.el('<div class="dd-label">' + esc(it.header) + '</div>')); return; }
      var b = MP.el('<button class="' + (it.danger ? 'danger' : '') + '">' + (it.icon ? icon(it.icon) : '') + '<span>' + esc(it.label) + '</span></button>');
      b.addEventListener('click', function () { ctx.close(); it.onClick && it.onClick(); });
      dd.appendChild(b);
    });
    document.body.appendChild(dd);
    var r = anchor.getBoundingClientRect();
    var w = dd.offsetWidth, h = dd.offsetHeight;
    var left = Math.min(window.innerWidth - w - 10, Math.max(10, r.right - w));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 10) { top = r.top - h - 6; dd.style.transformOrigin = 'bottom right'; }
    dd.style.left = left + 'px';
    dd.style.top = top + 'px';
    var ctx = {
      anchor: anchor,
      close: function () {
        document.removeEventListener('mousedown', outside, true);
        window.removeEventListener('scroll', ctx.close, true);
        layers = layers.filter(function (l) { return l !== ctx; });
        dd.classList.add('out');
        setTimeout(function () { dd.remove(); }, 140);
        if (openDropdown === ctx) openDropdown = null;
      }
    };
    function outside(e) { if (!dd.contains(e.target) && !anchor.contains(e.target)) ctx.close(); }
    setTimeout(function () {
      document.addEventListener('mousedown', outside, true);
      window.addEventListener('scroll', ctx.close, true);
    }, 0);
    layers.push(ctx);
    openDropdown = ctx;
    return ctx;
  };

  /* ------------------------------------------------------------ small components */
  /** Animated count-up for every [data-count] inside root. */
  MP.countUp = function (root) {
    $$('[data-count]', root).forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-count')) || 0;
      var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
      var suffix = el.getAttribute('data-suffix') || '';
      var from = parseFloat(el.getAttribute('data-from') || '0') || 0;
      el.setAttribute('data-from', to);
      if (from === to) { el.textContent = fmt(to); return; }
      var start = performance.now(), dur = 900;
      function fmt(v) { return (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suffix; }
      function step(now) {
        var p = Math.min(1, (now - start) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  };

  /** Tabs with a sliding ink bar. onChange(value) */
  MP.tabs = function (container, onChange) {
    var ink = $('.ink', container);
    if (!ink) { ink = MP.el('<span class="ink"></span>'); container.appendChild(ink); }
    function move(btn, instant) {
      if (!btn) return;
      if (instant) ink.style.transition = 'none';
      ink.style.width = btn.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
      if (instant) { void ink.offsetWidth; ink.style.transition = ''; }
    }
    container.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b || !container.contains(b)) return;
      $$('button[data-tab]', container).forEach(function (x) { x.classList.toggle('on', x === b); });
      move(b);
      onChange && onChange(b.getAttribute('data-tab'));
    });
    requestAnimationFrame(function () { move($('button.on', container), true); });
    return { refresh: function () { move($('button.on', container), true); } };
  };

  MP.switchHtml = function (name, checked, title, sub) {
    return '<label class="switch"><input type="checkbox" name="' + esc(name) + '"' + (checked ? ' checked' : '') + '><span class="track"></span>' +
      (title ? '<span class="txt"><b>' + esc(title) + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</span>' : '') + '</label>';
  };

  MP.badge = function (status, label) {
    var labels = {
      draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled',
      pending: 'Queued', sent: 'Sent', failed: 'Failed', invalid: 'Invalid', bounced: 'Bounced', skipped: 'Skipped',
      active: 'Active', unsubscribed: 'Unsubscribed', complained: 'Complained', manual: 'Blocked', hard: 'Hard bounce', soft: 'Soft bounce',
      complaint: 'Spam complaint', unsubscribe: 'Unsubscribe reply'
    };
    return '<span class="badge ' + esc(status) + '"><span class="dot"></span>' + esc(label || labels[status] || status) + '</span>';
  };

  MP.pager = function (res, onPage) {
    var el = MP.el('<div class="pager"><span>' + (res.total ? 'Showing ' + MP.num((res.page - 1) * res.per + 1) + '–' + MP.num(Math.min(res.total, res.page * res.per)) + ' of ' + MP.num(res.total) : 'No results') + '</span><span class="spacer"></span>' +
      '<button class="btn sm icon" data-p="prev"' + (res.page <= 1 ? ' disabled' : '') + '>' + icon('left') + '</button>' +
      '<span>Page ' + res.page + ' / ' + res.pages + '</span>' +
      '<button class="btn sm icon" data-p="next"' + (res.page >= res.pages ? ' disabled' : '') + '>' + icon('right') + '</button></div>');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]');
      if (!b) return;
      onPage(b.getAttribute('data-p') === 'next' ? res.page + 1 : res.page - 1);
    });
    return el;
  };

  MP.empty = function (ic, title, text, actionHtml) {
    return '<div class="empty"><div class="e-ico">' + icon(ic) + '</div><h3>' + esc(title) + '</h3><p>' + text + '</p>' + (actionHtml || '') + '</div>';
  };

  MP.skeleton = function (rows) {
    var h = '<div class="stack">';
    for (var i = 0; i < (rows || 4); i++) h += '<div class="skel" style="height:' + (i === 0 ? 90 : 64) + 'px;opacity:' + (1 - i * 0.15) + '"></div>';
    return h + '</div>';
  };

  MP.confetti = function () {
    var box = MP.el('<div class="confetti"></div>');
    var colors = ['#5b5bf0', '#8b5cf6', '#ec4899', '#f59e0b', '#12b76a', '#0ea5e9'];
    for (var i = 0; i < 90; i++) {
      var c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      c.style.animationDuration = (1.8 + Math.random() * 1.8) + 's';
      c.style.animationDelay = Math.random() * 0.4 + 's';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4200);
  };

  /* Button ripple */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect();
    var s = Math.max(r.width, r.height);
    var rp = document.createElement('span');
    rp.className = 'ripple';
    rp.style.width = rp.style.height = s + 'px';
    rp.style.left = (e.clientX - r.left - s / 2) + 'px';
    rp.style.top = (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(rp);
    setTimeout(function () { rp.remove(); }, 600);
  });

  /* ------------------------------------------------------------ theme */
  MP.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('mp-theme', cur); } catch (e) { /* ignore */ }
    var b = $('#themeBtn');
    if (b) b.innerHTML = icon(cur === 'dark' ? 'sun' : 'moon');
  };

  /* ------------------------------------------------------------ router */
  var routes = [];
  var renderToken = 0;
  var current = null;
  MP.route = function (pattern, view, nav) {
    var keys = [];
    var re = new RegExp('^' + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ re: re, keys: keys, view: view, nav: nav });
  };
  MP.go = function (path) {
    if (location.hash === '#' + path) render();
    else location.hash = '#' + path;
  };
  /** Changes the URL without re-rendering (e.g. after the first save of a new campaign). */
  MP.replacePath = function (path) {
    history.replaceState(null, '', '#' + path);
  };
  MP.setCrumbs = function (items) {
    var c = $('#crumbs');
    if (!c) return;
    c.innerHTML = items.map(function (it, i) {
      var last = i === items.length - 1;
      return (i ? icon('right', 'ico faint') : '') + (last ? '<b class="trunc">' + esc(it.label) + '</b>' : '<a href="#' + it.href + '">' + esc(it.label) + '</a>');
    }).join('');
    $$('svg', c).forEach(function (s) { s.style.width = '14px'; s.style.height = '14px'; s.style.flex = 'none'; });
    document.title = items[items.length - 1].label + ' · MailPilot';
  };

  function render() {
    if (!state.user) return;
    var path = location.hash.replace(/^#/, '') || '/';
    var match = null, params = {};
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(path);
      if (m) {
        match = routes[i];
        match.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        break;
      }
    }
    if (!match) { MP.go('/'); return; }
    var token = ++renderToken;
    var host = $('#view');
    setNav(match.nav);
    closeSidebar();
    var prev = current;
    current = null;
    var cleanupPrev = Promise.resolve().then(function () { return prev && prev.cleanup && prev.cleanup(); }).catch(function () {});
    var old = host.firstElementChild;
    if (old) old.classList.add('leaving');
    cleanupPrev.then(function () { return MP.sleep(old ? 140 : 0); }).then(function () {
      if (token !== renderToken) return;
      host.innerHTML = '';
      var v = document.createElement('div');
      v.className = 'view';
      host.appendChild(v);
      window.scrollTo(0, 0);
      var ctx = { alive: function () { return token === renderToken; } };
      current = { cleanup: null };
      var mine = current;
      Promise.resolve().then(function () { return match.view(v, params, ctx); }).then(function (cleanup) {
        if (token === renderToken) mine.cleanup = cleanup;
        else if (typeof cleanup === 'function') cleanup();
      }).catch(function (e) {
        console.error(e);
        if (token === renderToken) v.innerHTML = '<div class="card">' + MP.empty('alert', 'Something went wrong', esc(e.message || e), '<button class="btn" onclick="location.reload()">' + icon('refresh') + '<span>Reload</span></button>') + '</div>';
      });
    });
  }
  window.addEventListener('hashchange', render);

  /* ------------------------------------------------------------ shell */
  var NAV = [
    { id: 'dashboard', href: '/', label: 'Dashboard', icon: 'grid' },
    { id: 'campaigns', href: '/campaigns', label: 'Campaigns', icon: 'send' },
    { id: 'houses', href: '/houses', label: 'Email Houses', icon: 'house' },
    { id: 'suppression', href: '/suppression', label: 'Suppression', icon: 'shield' },
    { id: 'settings', href: '/settings', label: 'Settings', icon: 'settings' }
  ];

  function setNav(id) {
    var nav = $('#nav');
    if (!nav) return;
    var active = null;
    $$('a', nav).forEach(function (a) {
      var on = a.getAttribute('data-nav') === id;
      a.classList.toggle('active', on);
      if (on) active = a;
    });
    var g = $('.nav-glider', nav);
    if (active) {
      g.style.opacity = '1';
      g.style.transform = 'translateY(' + active.offsetTop + 'px)';
    } else g.style.opacity = '0';
  }

  function closeSidebar() {
    var s = $('#sidebar');
    if (s) s.classList.remove('open');
    var o = $('#sideOverlay');
    if (o) { o.classList.add('out'); setTimeout(function () { o.remove(); }, 220); }
  }

  function renderShell() {
    var u = state.user;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('#app').innerHTML =
      '<div class="shell">' +
      '<aside class="sidebar" id="sidebar">' +
      '<div class="brand"><div class="logo">' + icon('send') + '</div><div>MailPilot<small>' + esc((state.appUrl || '').replace(/^https?:\/\//, '')) + '</small></div></div>' +
      '<nav class="nav" id="nav"><span class="nav-glider"></span>' +
      NAV.map(function (n) {
        return '<a href="#' + n.href + '" data-nav="' + n.id + '">' + icon(n.icon) + '<span>' + n.label + '</span>' + (n.id === 'campaigns' ? '<span class="count hidden" id="navSending"></span>' : '') + '</a>';
      }).join('') +
      '</nav>' +
      '<div class="side-bottom">' +
      '<div class="engine-card" id="engineCard"><div class="top"><span class="pulse"></span><span>Engine</span></div><div class="sub">Loading…</div></div>' +
      '<div class="user-chip" id="userChip"><div class="avatar">' + esc(MP.initials(u.username)) + '</div><div class="who"><b class="trunc">' + esc(u.username) + '</b><span>Administrator</span></div>' + icon('more', 'ico faint') + '</div>' +
      '</div></aside>' +
      '<div class="main">' +
      '<header class="topbar" id="topbar"><button class="btn ghost icon menu-btn" id="menuBtn">' + icon('menu') + '</button>' +
      '<div class="crumbs" id="crumbs"></div><span class="spacer"></span>' +
      '<button class="btn ghost icon" id="themeBtn" data-tip="Toggle dark mode">' + icon(dark ? 'sun' : 'moon') + '</button>' +
      '<button class="btn primary" id="newCampaignBtn">' + icon('plus') + '<span>New campaign</span></button>' +
      '</header>' +
      '<div class="banners" id="banners"></div>' +
      '<div class="content" id="view"></div>' +
      '</div></div>';

    $('#themeBtn').addEventListener('click', MP.toggleTheme);
    $('#newCampaignBtn').addEventListener('click', function () { MP.go('/campaigns/new'); });
    $('#menuBtn').addEventListener('click', function () {
      $('#sidebar').classList.add('open');
      var o = MP.el('<div class="overlay" id="sideOverlay" style="z-index:39"></div>');
      o.addEventListener('click', closeSidebar);
      document.body.appendChild(o);
    });
    $('#userChip').addEventListener('click', function (e) {
      MP.dropdown(e.currentTarget, [
        { header: 'Signed in as ' + state.user.username },
        { label: 'Account & password', icon: 'key', onClick: function () { MP.go('/settings/account'); } },
        { label: 'Toggle dark mode', icon: 'moon', onClick: MP.toggleTheme },
        '-',
        { label: 'Sign out', icon: 'logout', danger: true, onClick: logout }
      ]);
    });
    $('#engineCard').addEventListener('click', function () { MP.go('/settings/speed'); });
    $('#engineCard').style.cursor = 'pointer';
    window.addEventListener('scroll', function () {
      var t = $('#topbar');
      if (t) t.classList.toggle('scrolled', window.scrollY > 4);
    }, { passive: true });
    renderBanners();
  }

  function renderBanners() {
    var b = $('#banners');
    if (!b) return;
    var html = '';
    if (state.user && state.user.must_change && !sessionStorage.getItem('mp-hide-pw')) {
      html += '<div class="alert warn">' + icon('key') + '<div class="grow"><b>You are using the initial password.</b> Please choose your own password now to keep your account safe.</div>' +
        '<button class="btn sm" data-go="/settings/account">Change password</button><button class="btn ghost icon sm" data-hide="pw">' + icon('x') + '</button></div>';
    }
    var e = state.engine;
    if (e && e.engine_error) {
      html += '<div class="alert error">' + icon('octagon') + '<div class="grow"><b>Mail server problem:</b> ' + esc(e.engine_error) +
        ' <span class="faint">(' + MP.ago(e.engine_error_at) + ')</span><br>Sending is paused until this is fixed — queued emails are safe and will be sent automatically.</div>' +
        '<button class="btn sm" data-go="/settings/sender">Check settings</button></div>';
    }
    b.innerHTML = html;
    $$('[data-go]', b).forEach(function (x) { x.addEventListener('click', function () { MP.go(x.getAttribute('data-go')); }); });
    $$('[data-hide]', b).forEach(function (x) {
      x.addEventListener('click', function () { sessionStorage.setItem('mp-hide-pw', '1'); renderBanners(); });
    });
  }
  MP.renderBanners = renderBanners;

  /* ------------------------------------------------------------ sending engine status + browser pump */
  var pump = { running: false };
  var lastBannerError = null;

  function applyEngine(e) {
    state.engine = e;
    var card = $('#engineCard');
    if (card) {
      var cls = 'pulse', title = 'Idle', sub = '';
      var active = e.sending_campaigns > 0;
      if (e.engine_error) { cls += ' err'; title = 'Mail server error'; sub = 'Click to review settings'; }
      else if (active) {
        cls += ' on'; title = 'Sending';
        sub = MP.num(e.pending) + ' queued · ' + (e.cron_ok ? 'via cron' : (pump.running ? 'from this tab — keep it open' : 'waiting for cron'));
      } else if (e.scheduled_campaigns > 0) { cls += ' warn'; title = 'Scheduled'; sub = MP.plural(e.scheduled_campaigns, 'campaign') + ' waiting'; }
      else { sub = e.cron_ok ? 'Cron is running · ready' : (e.cron_last_run ? 'Cron last ran ' + MP.ago(e.cron_last_run) : 'Cron not set up yet'); }
      var limit = e.hourly_limit || 0;
      var used = limit ? Math.min(100, e.sent_last_hour / limit * 100) : 0;
      card.innerHTML = '<div class="top"><span class="' + cls + '"></span><span>' + title + '</span><span class="spacer"></span><span class="faint" style="font-weight:500">' +
        MP.num(e.sent_last_hour) + (limit ? '/' + MP.num(limit) : '') + ' /h</span></div><div class="sub">' + esc(sub) + '</div>' +
        '<div class="meter"><i style="width:' + used + '%"></i></div>';
    }
    var ns = $('#navSending');
    if (ns) {
      ns.classList.toggle('hidden', !(e.sending_campaigns > 0));
      ns.textContent = e.sending_campaigns;
    }
    if ((e.engine_error || '') !== (lastBannerError || '')) {
      lastBannerError = e.engine_error || '';
      renderBanners();
    }
    MP.emit('engine', e);
    maybePump();
  }
  MP.applyEngine = applyEngine;

  function pumpNeeded() {
    var e = state.engine;
    return !!(state.user && e && !e.cron_ok && (e.sending_campaigns > 0 || e.scheduled_campaigns > 0) && e.smtp_configured);
  }

  function maybePump() {
    if (pump.running || !pumpNeeded()) return;
    pump.running = true;
    (function loop() {
      if (!pumpNeeded()) { pump.running = false; applyEngineQuiet(); return; }
      MP.api('engine.run', {}).then(function (r) {
        MP.emit('engine-run', r.summary);
        state.engine = r.engine;
        applyEngineNoPump(r.engine);
        var s = r.summary.status;
        var wait = s === 'sending' ? 1200 : (s === 'busy' ? 8000 : 30000);
        if (s === 'idle' && r.engine.sending_campaigns === 0) wait = 30000;
        setTimeout(loop, wait);
      }).catch(function () { setTimeout(loop, 30000); });
    })();
  }
  function applyEngineNoPump(e) {
    var was = pump.running;
    pump.running = true;
    applyEngine(e);
    pump.running = was;
  }
  function applyEngineQuiet() { if (state.engine) applyEngineNoPump(state.engine); }

  function pollEngine() {
    if (!state.user) return;
    MP.api('engine.status', {}).then(function (r) { applyEngine(r.engine); }).catch(function () {}).finally(function () {
      clearTimeout(pollEngine.t);
      pollEngine.t = setTimeout(pollEngine, document.hidden ? 60000 : 20000);
    });
  }
  MP.refreshEngine = function () {
    return MP.api('engine.status', {}).then(function (r) { applyEngine(r.engine); return r.engine; });
  };

  /* ------------------------------------------------------------ login / boot */
  function logout() {
    MP.api('auth.logout', {}).catch(function () {}).then(function () {
      state.user = null;
      clearTimeout(pollEngine.t);
      MP.showLogin();
      MP.toast('Signed out. See you soon!', 'info');
    });
  }

  MP.showLogin = function () {
    clearTimeout(pollEngine.t);
    var app = $('#app');
    app.innerHTML =
      '<div class="login"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' +
      '<form class="login-card" id="loginForm" autocomplete="on">' +
      '<div class="logo logo-lg">' + icon('send') + '</div>' +
      '<h1>Welcome back</h1><p class="sub">Sign in to MailPilot to manage your campaigns.</p>' +
      '<div class="field float"><input class="input" name="username" id="lu" placeholder=" " autocomplete="username" required><label for="lu">Username</label></div>' +
      '<div class="field float"><input class="input" type="password" name="password" id="lp" placeholder=" " autocomplete="current-password" required><label for="lp">Password</label>' +
      '<button type="button" class="btn ghost icon sm eye" id="eye">' + icon('eye') + '</button></div>' +
      '<button class="btn primary" type="submit"><span>Sign in</span>' + icon('right') + '</button>' +
      '<div class="login-foot">Protected area · ' + esc(location.host) + '</div>' +
      '</form></div>';
    var form = $('#loginForm');
    setTimeout(function () { $('#lu').focus(); }, 300);
    $('#eye').addEventListener('click', function () {
      var p = $('#lp');
      p.type = p.type === 'password' ? 'text' : 'password';
      this.innerHTML = icon(p.type === 'password' ? 'eye' : 'eyeoff');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', form);
      btn.classList.add('loading');
      MP.api('auth.login', { username: form.username.value, password: form.password.value }, { noAuthRedirect: true })
        .then(function (r) {
          state.csrf = r.csrf;
          state.user = r.user;
          form.classList.add('out');
          return MP.sleep(380).then(enterApp);
        })
        .catch(function (err) {
          btn.classList.remove('loading');
          form.classList.remove('shake');
          void form.offsetWidth;
          form.classList.add('shake');
          MP.toast(err.message, 'error');
        });
    });
  };

  function enterApp() {
    return MP.api('app.boot', {}).then(function (b) {
      state.user = b.user;
      state.appUrl = b.app_url;
      state.fromEmail = b.from_email;
      state.fromName = b.from_name;
      renderShell();
      applyEngine(b.engine);
      clearTimeout(pollEngine.t);
      pollEngine.t = setTimeout(pollEngine, 20000);
      render();
      var hour = new Date().getHours();
      if (!sessionStorage.getItem('mp-welcomed')) {
        sessionStorage.setItem('mp-welcomed', '1');
        MP.toast((hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + b.user.username + '!', 'info', 2600);
      }
    });
  }
  MP.userUpdated = function (u) {
    state.user = u;
    var chip = $('#userChip');
    if (chip) {
      $('.avatar', chip).textContent = MP.initials(u.username);
      $('.who b', chip).textContent = u.username;
    }
    renderBanners();
  };

  function start() {
    MP.api('auth.state', {}, { noAuthRedirect: true }).then(function (r) {
      state.csrf = r.csrf;
      if (r.user) {
        state.user = r.user;
        return enterApp();
      }
      MP.showLogin();
    }).catch(function (e) {
      $('#app').innerHTML = '<div class="login"><div class="login-card">' + MP.empty('alert', 'Cannot reach the server', esc(e.message)) + '</div></div>';
    }).finally(function () {
      var b = $('#boot');
      if (b) { b.classList.add('out'); setTimeout(function () { b.remove(); }, 450); }
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.user) pollEngine();
  });
  document.addEventListener('DOMContentLoaded', start);
})();
