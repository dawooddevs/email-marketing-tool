<?php
/**
 * MailPilot — single-page admin app shell. Everything else happens over AJAX (api.php).
 */
define('EMT', 1);
require __DIR__ . '/app/bootstrap.php';

if (!emt_installed()) {
    if (is_file(__DIR__ . '/install.php')) {
        header('Location: install.php');
    } else {
        echo 'MailPilot is not installed. Upload install.php and open it in your browser.';
    }
    exit;
}
Auth::startSession();
$csrf = Auth::csrfToken();
$v = EMT_VERSION . '-' . substr(md5((string) @filemtime(__DIR__ . '/assets/js/core.js') . @filemtime(__DIR__ . '/assets/js/campaigns.js') . @filemtime(__DIR__ . '/assets/app.css')), 0, 8);
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#5b5bf0">
<title>MailPilot</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css?v=<?php echo $v; ?>">
<script>
  (function () {
    var t = null;
    try { t = localStorage.getItem('mp-theme'); } catch (e) {}
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  })();
</script>
</head>
<body>
<div class="boot" id="boot"><div class="boot-logo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></div></div>
<div id="app"></div>
<div class="toasts" id="toasts"></div>
<script>window.MP_BOOT = { csrf: <?php echo json_encode($csrf); ?>, version: <?php echo json_encode(EMT_VERSION); ?> };</script>
<?php foreach (array('core', 'dashboard', 'campaigns', 'houses', 'suppression', 'settings') as $js): ?>
<script src="assets/js/<?php echo $js; ?>.js?v=<?php echo $v; ?>"></script>
<?php endforeach; ?>
</body>
</html>
