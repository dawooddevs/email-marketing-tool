<?php
/**
 * Open (?o=token) and click (?c=token&l=linkId) tracking.
 */
define('EMT', 1);
require __DIR__ . '/app/bootstrap.php';

function emt_pixel()
{
    header('Content-Type: image/gif');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    exit;
}

if (!emt_installed()) {
    isset($_GET['o']) ? emt_pixel() : http_response_code(404);
    exit;
}

try {
    // ---- Open tracking pixel
    if (isset($_GET['o'])) {
        $rid = Crypto::parseRecipientToken((string) $_GET['o']);
        if ($rid) {
            DB::exec(
                'UPDATE emt_recipients SET opens = opens + 1, opened_at = COALESCE(opened_at, ?) WHERE id = ?',
                array(Util::now(), $rid)
            );
        }
        emt_pixel();
    }

    // ---- Click tracking redirect
    if (isset($_GET['c'], $_GET['l'])) {
        $linkId = (int) $_GET['l'];
        $link = DB::one('SELECT id, campaign_id, url FROM emt_links WHERE id = ?', array($linkId));
        if (!$link) {
            http_response_code(404);
            echo 'Link not found.';
            exit;
        }
        $target = html_entity_decode($link['url'], ENT_QUOTES, 'UTF-8');
        $rid = Crypto::parseRecipientToken((string) $_GET['c']);
        $recipient = $rid ? DB::one('SELECT id, campaign_id, email, name FROM emt_recipients WHERE id = ?', array($rid)) : null;
        if ($recipient && (int) $recipient['campaign_id'] === (int) $link['campaign_id']) {
            $now = Util::now();
            // A click implies the email was opened (images may be blocked).
            DB::exec(
                'UPDATE emt_recipients SET clicks = clicks + 1, clicked_at = COALESCE(clicked_at, ?),
                        opened_at = COALESCE(opened_at, ?), opens = GREATEST(opens, 1) WHERE id = ?',
                array($now, $now, $recipient['id'])
            );
            $first = DB::q('INSERT IGNORE INTO emt_link_clicks (recipient_id, link_id, clicked_at) VALUES (?, ?, ?)', array($recipient['id'], $link['id'], $now))->rowCount();
            DB::exec('UPDATE emt_links SET clicks = clicks + 1, unique_clicks = unique_clicks + ? WHERE id = ?', array($first ? 1 : 0, $link['id']));
            // Personalised links, e.g. https://site.com/?email={{email}}
            if (strpos($target, '{{') !== false) {
                $vars = Mailer::vars($recipient, Settings::appUrl() . '/u.php?r=' . Crypto::recipientToken($recipient['id']));
                $vars = array_map('rawurlencode', $vars);
                $target = Mailer::fillTags($target, $vars, false);
            }
        }
        if (!preg_match('#^https?://#i', $target)) {
            http_response_code(400);
            echo 'Invalid link.';
            exit;
        }
        header('Cache-Control: no-store');
        header('Location: ' . $target, true, 302);
        exit;
    }
} catch (Throwable $e) {
    error_log('[MailPilot tracking] ' . $e->getMessage());
    if (isset($_GET['o'])) {
        emt_pixel();
    }
}
http_response_code(404);
echo 'Not found.';
