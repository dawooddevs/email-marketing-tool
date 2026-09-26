<?php
defined('EMT') or exit;

/** Reads the bounce mailbox over POP3 and records bounces / complaints / unsubscribe replies. */
class Bounces
{
    const MAX_FULL_SIZE = 3145728; // download at most 3 MB per message

    /** Opens an authenticated POP3 session using the saved settings. */
    public static function open()
    {
        $pop = new Pop3();
        $pop->connect(Settings::get('pop_host'), Settings::get('pop_port'), Settings::get('pop_secure'));
        $pass = Settings::get('pop_pass');
        if ($pass === '') {
            // Default to the SMTP password when the mailbox is the same.
            $pass = Settings::get('smtp_pass');
        }
        $pop->login(Settings::get('pop_user'), $pass);
        return $pop;
    }

    public static function check($limit = 150)
    {
        Util::longRunning(300);
        $summary = array('scanned' => 0, 'bounces' => 0, 'hard' => 0, 'soft' => 0, 'complaints' => 0, 'unsubscribes' => 0, 'mailbox_total' => 0);
        $pop = self::open();
        try {
            $uidl = $pop->uidl();
            $summary['mailbox_total'] = count($uidl);
            $sizes = $pop->listSizes();
            $seen = array();
            $uids = array_values($uidl);
            foreach (array_chunk($uids, 500) as $chunk) {
                foreach (DB::col('SELECT uidl FROM emt_mailbox_seen WHERE uidl IN (' . DB::in($chunk) . ')', $chunk) as $u) {
                    $seen[$u] = true;
                }
            }
            $new = array();
            foreach ($uidl as $num => $uid) {
                if (!isset($seen[$uid])) {
                    $new[$num] = $uid;
                }
            }
            krsort($new); // newest first
            $new = array_slice($new, 0, $limit, true);
            $delete = Settings::bool('pop_delete');

            foreach ($new as $num => $uid) {
                $summary['scanned']++;
                $headers = $pop->top($num, 0);
                if (BounceParser::headersLookInteresting($headers)) {
                    $size = isset($sizes[$num]) ? $sizes[$num] : 0;
                    $raw = $size > self::MAX_FULL_SIZE ? $pop->top($num, 400) : $pop->retr($num);
                    $result = BounceParser::parse($raw);
                    if ($result && $result['type'] !== null) {
                        $handled = self::handle($result);
                        if ($handled) {
                            $summary['bounces'] += in_array($result['type'], array('hard', 'soft'), true) ? 1 : 0;
                            if ($result['type'] === 'hard') {
                                $summary['hard']++;
                            } elseif ($result['type'] === 'soft') {
                                $summary['soft']++;
                            } elseif ($result['type'] === 'complaint') {
                                $summary['complaints']++;
                            } elseif ($result['type'] === 'unsubscribe') {
                                $summary['unsubscribes']++;
                            }
                        }
                        if ($delete && $result['type'] !== 'unsubscribe') {
                            $pop->dele($num);
                        }
                    }
                }
                DB::q('INSERT IGNORE INTO emt_mailbox_seen (uidl, seen_at) VALUES (?, ?)', array(substr($uid, 0, 190), Util::now()));
            }
        } finally {
            $pop->quit();
        }
        Settings::set('bounce_last_check', Util::now());
        Settings::set('bounce_last_result', json_encode($summary));
        return $summary;
    }

    /** Applies one parsed bounce/complaint/unsubscribe. Returns true when something was recorded. */
    public static function handle(array $b)
    {
        if ($b['type'] === 'delayed') {
            return false;
        }
        $recipient = null;
        if ($b['token'] !== '') {
            $rid = Crypto::parseRecipientToken($b['token']);
            if ($rid) {
                $recipient = DB::one('SELECT id, campaign_id, email, status, bounce_type FROM emt_recipients WHERE id = ?', array($rid));
            }
        }
        $email = $b['email'];
        if ($recipient && ($email === '' || $b['type'] === 'complaint')) {
            $email = $recipient['email'];
        }
        if ($email === '') {
            return false;
        }
        if (!$recipient) {
            $recipient = DB::one(
                "SELECT id, campaign_id, email, status, bounce_type FROM emt_recipients
                 WHERE email = ? AND sent_at IS NOT NULL AND sent_at >= ? ORDER BY sent_at DESC LIMIT 1",
                array($email, Util::now(-60 * 86400))
            );
        }
        $now = Util::now();
        $campaignId = $recipient ? (int) $recipient['campaign_id'] : null;
        $diag = $b['diagnostic'];

        switch ($b['type']) {
            case 'hard':
            case 'soft':
                if ($recipient) {
                    DB::exec(
                        "UPDATE emt_recipients SET status = 'bounced',
                            bounce_type = IF(bounce_type = 'hard', 'hard', ?), bounced_at = COALESCE(bounced_at, ?), error = ?
                         WHERE id = ? AND status IN ('sent','pending','failed','bounced')",
                        array($b['type'], $now, Util::truncate(($b['status'] ? $b['status'] . ' ' : '') . $diag, 480), $recipient['id'])
                    );
                }
                if ($b['type'] === 'hard') {
                    Suppression::add($email, 'bounced', ($b['status'] ? $b['status'] . ' ' : '') . $diag, $campaignId);
                } else {
                    $recent = (int) DB::val(
                        "SELECT COUNT(*) FROM emt_bounces WHERE email = ? AND type = 'soft' AND received_at >= ?",
                        array($email, Util::now(-60 * 86400))
                    );
                    if ($recent >= 2) {
                        Suppression::add($email, 'bounced', 'Repeated soft bounces: ' . $diag, $campaignId);
                    }
                }
                break;
            case 'complaint':
                if ($recipient) {
                    DB::exec('UPDATE emt_recipients SET complained_at = COALESCE(complained_at, ?) WHERE id = ?', array($now, $recipient['id']));
                }
                Suppression::add($email, 'complained', $diag, $campaignId);
                break;
            case 'unsubscribe':
                if ($recipient) {
                    DB::exec('UPDATE emt_recipients SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE id = ?', array($now, $recipient['id']));
                }
                Suppression::add($email, 'unsubscribed', $diag, $campaignId);
                break;
            default:
                return false;
        }
        DB::insert('emt_bounces', array(
            'email' => $email,
            'recipient_id' => $recipient ? (int) $recipient['id'] : null,
            'campaign_id' => $campaignId,
            'type' => $b['type'],
            'code' => (string) $b['status'],
            'diagnostic' => Util::truncate($diag, 480),
            'subject' => Util::truncate($b['subject'], 250),
            'received_at' => $now,
        ));
        return true;
    }
}
