<?php
defined('EMT') or exit;

/**
 * Global suppression list: addresses that must never be emailed again
 * (unsubscribed, hard-bounced, complained, invalid or manually blocked).
 */
class Suppression
{
    /** Maps a suppression reason to the contact status used in Email Houses. */
    public static function contactStatus($reason)
    {
        $map = array(
            'unsubscribed' => 'unsubscribed',
            'bounced' => 'bounced',
            'complained' => 'complained',
            'invalid' => 'invalid',
            'manual' => 'unsubscribed',
        );
        return isset($map[$reason]) ? $map[$reason] : 'unsubscribed';
    }

    public static function add($email, $reason, $detail = '', $campaignId = null)
    {
        $email = Util::normalizeEmail($email);
        if ($email === '') {
            return;
        }
        $existing = DB::one('SELECT reason FROM emt_suppressions WHERE email = ?', array($email));
        if (!$existing) {
            DB::insert('emt_suppressions', array(
                'email' => $email,
                'reason' => $reason,
                'detail' => Util::truncate($detail, 250),
                'campaign_id' => $campaignId ? (int) $campaignId : null,
                'created_at' => Util::now(),
            ));
        } elseif ($existing['reason'] === 'invalid' && $reason !== 'invalid') {
            // A more specific reason wins over "invalid".
            DB::update('emt_suppressions', array('reason' => $reason, 'detail' => Util::truncate($detail, 250)), 'email = ?', array($email));
        }
        DB::exec(
            "UPDATE emt_contacts SET status = ?, updated_at = ? WHERE email = ? AND status = 'active'",
            array(self::contactStatus($reason), Util::now(), $email)
        );
    }

    public static function remove($email)
    {
        $email = Util::normalizeEmail($email);
        DB::exec('DELETE FROM emt_suppressions WHERE email = ?', array($email));
        DB::exec("UPDATE emt_contacts SET status = 'active', updated_at = ? WHERE email = ? AND status <> 'active'", array(Util::now(), $email));
    }

    public static function reasonFor($email)
    {
        return DB::val('SELECT reason FROM emt_suppressions WHERE email = ?', array(Util::normalizeEmail($email)));
    }

    /** Applies the suppression list to the contacts of one house (after an import). */
    public static function applyToList($listId)
    {
        return DB::exec(
            "UPDATE emt_contacts c JOIN emt_suppressions s ON s.email = c.email
             SET c.status = CASE s.reason
                 WHEN 'bounced' THEN 'bounced'
                 WHEN 'complained' THEN 'complained'
                 WHEN 'invalid' THEN 'invalid'
                 ELSE 'unsubscribed' END,
                 c.updated_at = ?
             WHERE c.list_id = ? AND c.status = 'active'",
            array(Util::now(), (int) $listId)
        );
    }
}
