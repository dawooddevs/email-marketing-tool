<?php
/**
 * Public unsubscribe page (also handles RFC 8058 one-click unsubscribe POSTs).
 */
define('EMT', 1);
require __DIR__ . '/app/bootstrap.php';

if (!emt_installed()) {
    http_response_code(404);
    exit('Not found.');
}

$token = isset($_REQUEST['r']) ? (string) $_REQUEST['r'] : '';
$rid = Crypto::parseRecipientToken($token);
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
$oneClick = $isPost && isset($_POST['List-Unsubscribe']) && $_POST['List-Unsubscribe'] === 'One-Click';
$action = $isPost ? (isset($_POST['action']) ? (string) $_POST['action'] : 'unsubscribe') : 'view';
$brand = (string) Settings::get('from_name');
if ($brand === '') {
    $brand = 'our mailing list';
}

$recipient = $rid ? DB::one('SELECT id, campaign_id, email, unsubscribed_at FROM emt_recipients WHERE id = ?', array($rid)) : null;
$state = 'invalid';
$email = $recipient ? $recipient['email'] : '';

if ($rid === 0 || $token === '0.' . Crypto::sign('r0')) {
    $state = 'test';
} elseif ($recipient) {
    $reason = Suppression::reasonFor($email);
    if ($isPost && $action === 'unsubscribe') {
        DB::exec('UPDATE emt_recipients SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE id = ?', array(Util::now(), $recipient['id']));
        Suppression::add($email, 'unsubscribed', 'Unsubscribed via link', $recipient['campaign_id']);
        $state = 'done';
    } elseif ($isPost && $action === 'resubscribe') {
        if (in_array($reason, array('unsubscribed', 'manual'), true)) {
            Suppression::remove($email);
            DB::exec('UPDATE emt_recipients SET unsubscribed_at = NULL WHERE id = ?', array($recipient['id']));
        }
        $state = 'resubscribed';
    } else {
        $state = in_array($reason, array('unsubscribed', 'manual', 'complained'), true) ? 'already' : 'confirm';
    }
}

if ($oneClick) {
    header('Content-Type: text/plain; charset=utf-8');
    echo $state === 'done' ? 'Unsubscribed' : 'OK';
    exit;
}

function emt_mask($email)
{
    $at = strpos($email, '@');
    if ($at === false) {
        return $email;
    }
    $local = substr($email, 0, $at);
    $shown = strlen($local) <= 2 ? substr($local, 0, 1) : substr($local, 0, 2);
    return $shown . str_repeat('•', max(1, min(6, strlen($local) - strlen($shown)))) . substr($email, $at);
}

$h = 'Util::h';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Email preferences</title>
<style>
  :root { --bg:#f4f5fb; --card:#fff; --text:#1c1d29; --muted:#6b6f80; --primary:#5b5bf0; --border:#e6e7ef; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0e0f16; --card:#171823; --text:#eceef6; --muted:#9a9db0; --border:#262838; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--text); }
  .card { width:100%; max-width:440px; background:var(--card); border:1px solid var(--border); border-radius:20px; padding:36px 32px;
          text-align:center; box-shadow:0 20px 60px -20px rgba(30,30,80,.25); animation:pop .5s cubic-bezier(.2,.9,.3,1.2); }
  @keyframes pop { from { opacity:0; transform:translateY(12px) scale(.97); } to { opacity:1; transform:none; } }
  .icon { width:64px; height:64px; margin:0 auto 18px; border-radius:50%; display:grid; place-items:center; font-size:30px;
          background:color-mix(in srgb, var(--primary) 14%, transparent); }
  h1 { font-size:22px; margin:0 0 10px; }
  p { color:var(--muted); line-height:1.6; margin:0 0 22px; }
  b { color:var(--text); }
  button { appearance:none; border:0; border-radius:12px; padding:13px 22px; font-size:15px; font-weight:600; cursor:pointer;
           background:var(--primary); color:#fff; width:100%; transition:transform .15s, box-shadow .15s; }
  button:hover { transform:translateY(-1px); box-shadow:0 8px 20px -8px var(--primary); }
  .link { background:none; color:var(--muted); font-weight:500; font-size:14px; margin-top:6px; }
  .link:hover { box-shadow:none; color:var(--text); }
</style>
</head>
<body>
<div class="card">
<?php if ($state === 'confirm'): ?>
  <div class="icon">✉️</div>
  <h1>Unsubscribe?</h1>
  <p>You will no longer receive emails from <b><?php echo $h($brand); ?></b> at <b><?php echo $h(emt_mask($email)); ?></b>.</p>
  <form method="post">
    <input type="hidden" name="r" value="<?php echo $h($token); ?>">
    <input type="hidden" name="action" value="unsubscribe">
    <button type="submit">Yes, unsubscribe me</button>
  </form>
<?php elseif ($state === 'done' || $state === 'already'): ?>
  <div class="icon">✅</div>
  <h1>You're unsubscribed</h1>
  <p><b><?php echo $h(emt_mask($email)); ?></b> has been removed from <b><?php echo $h($brand); ?></b> emails. Sorry to see you go!</p>
  <form method="post">
    <input type="hidden" name="r" value="<?php echo $h($token); ?>">
    <input type="hidden" name="action" value="resubscribe">
    <button type="submit" class="link">Unsubscribed by mistake? Resubscribe</button>
  </form>
<?php elseif ($state === 'resubscribed'): ?>
  <div class="icon">🎉</div>
  <h1>Welcome back!</h1>
  <p>You are subscribed to <b><?php echo $h($brand); ?></b> emails again.</p>
<?php elseif ($state === 'test'): ?>
  <div class="icon">🧪</div>
  <h1>This is a test email</h1>
  <p>Unsubscribe links in test emails don't do anything. In real campaigns this page lets recipients unsubscribe.</p>
<?php else: ?>
  <div class="icon">🔗</div>
  <h1>Link not valid</h1>
  <p>This unsubscribe link is incomplete or has expired. Reply to our email with “unsubscribe” and we will remove you.</p>
<?php endif; ?>
</div>
</body>
</html>
