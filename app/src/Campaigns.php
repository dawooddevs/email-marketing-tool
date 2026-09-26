<?php
defined('EMT') or exit;

/** Campaign lifecycle: queue building, stats and state changes. */
class Campaigns
{
    public static function find($id)
    {
        return DB::one('SELECT * FROM emt_campaigns WHERE id = ?', array((int) $id));
    }

    public static function listIds($id)
    {
        return array_map('intval', DB::col('SELECT list_id FROM emt_campaign_lists WHERE campaign_id = ?', array((int) $id)));
    }

    /** Number of contacts that would receive the campaign if it started now. */
    public static function audienceCount(array $listIds)
    {
        if (!$listIds) {
            return array('sendable' => 0, 'skipped' => 0);
        }
        $in = DB::in($listIds);
        $sendable = (int) DB::val(
            "SELECT COUNT(DISTINCT c.email) FROM emt_contacts c LEFT JOIN emt_suppressions s ON s.email = c.email
             WHERE c.list_id IN ($in) AND c.status = 'active' AND s.email IS NULL",
            $listIds
        );
        $all = (int) DB::val("SELECT COUNT(DISTINCT email) FROM emt_contacts WHERE list_id IN ($in)", $listIds);
        return array('sendable' => $sendable, 'skipped' => max(0, $all - $sendable));
    }

    /** Validates and launches (or schedules) a draft campaign. Returns number of queued recipients. */
    public static function launch($id, $scheduledAtUtc = null)
    {
        $c = self::find($id);
        if (!$c) {
            throw new InvalidArgumentException('Campaign not found.');
        }
        if ($c['status'] !== 'draft') {
            throw new InvalidArgumentException('Only draft campaigns can be launched.');
        }
        $problems = self::launchProblems($c);
        if ($problems) {
            throw new InvalidArgumentException(implode(' ', $problems));
        }
        $listIds = self::listIds($id);
        $queued = DB::tx(function () use ($id, $listIds, $c, $scheduledAtUtc) {
            $queued = self::buildQueue($id, $listIds, $c['html']);
            if ($queued === 0) {
                throw new InvalidArgumentException('There is nobody to send to: the selected houses have no active (non-suppressed) contacts.');
            }
            $now = Util::now();
            $data = array('updated_at' => $now, 'last_error' => null, 'completed_at' => null);
            if ($scheduledAtUtc && strtotime($scheduledAtUtc . ' UTC') > time()) {
                $data['status'] = 'scheduled';
                $data['scheduled_at'] = $scheduledAtUtc;
                $data['started_at'] = null;
            } else {
                $data['status'] = 'sending';
                $data['scheduled_at'] = null;
                $data['started_at'] = $now;
            }
            DB::update('emt_campaigns', $data, 'id = ?', array($id));
            return $queued;
        });
        return $queued;
    }

    /** @return string[] human readable problems preventing launch */
    public static function launchProblems(array $c)
    {
        $p = array();
        if (trim($c['subject']) === '') {
            $p[] = 'Add a subject line.';
        }
        if (trim((string) $c['html']) === '') {
            $p[] = 'Add the HTML content of the email.';
        }
        $from = $c['from_email'] !== '' ? $c['from_email'] : Settings::get('from_email');
        if (!Util::isValidEmail(Util::normalizeEmail($from))) {
            $p[] = 'The sender (From) email address is not valid.';
        }
        if (!self::listIds($c['id'])) {
            $p[] = 'Choose at least one Email House to send to.';
        }
        if (!Settings::smtpConfigured()) {
            $p[] = 'Configure the SMTP settings (Settings → Sending) first.';
        }
        return $p;
    }

    /** Fills emt_recipients from the selected houses. Returns the number of pending recipients. */
    public static function buildQueue($id, array $listIds, $html)
    {
        $id = (int) $id;
        DB::exec('DELETE FROM emt_recipients WHERE campaign_id = ?', array($id));
        DB::exec('DELETE FROM emt_links WHERE campaign_id = ?', array($id));
        if (!$listIds) {
            return 0;
        }
        $in = DB::in($listIds);
        DB::q(
            "INSERT IGNORE INTO emt_recipients (campaign_id, contact_id, email, name, status)
             SELECT ?, c.id, c.email, c.name, 'pending'
             FROM emt_contacts c LEFT JOIN emt_suppressions s ON s.email = c.email
             WHERE c.list_id IN ($in) AND c.status = 'active' AND s.email IS NULL
             ORDER BY c.id",
            array_merge(array($id), $listIds)
        );
        DB::q(
            "INSERT IGNORE INTO emt_recipients (campaign_id, contact_id, email, name, status, error)
             SELECT ?, c.id, c.email, c.name, 'skipped',
                    CASE WHEN s.email IS NOT NULL THEN CONCAT('Suppressed: ', s.reason) ELSE CONCAT('Contact status: ', c.status) END
             FROM emt_contacts c LEFT JOIN emt_suppressions s ON s.email = c.email
             WHERE c.list_id IN ($in) AND (c.status <> 'active' OR s.email IS NOT NULL)
             ORDER BY c.id",
            array_merge(array($id), $listIds)
        );
        foreach (Mailer::extractLinks($html) as $url) {
            DB::insert('emt_links', array('campaign_id' => $id, 'url' => $url));
        }
        $total = (int) DB::val('SELECT COUNT(*) FROM emt_recipients WHERE campaign_id = ?', array($id));
        DB::exec('UPDATE emt_campaigns SET total = ? WHERE id = ?', array($total, $id));
        return (int) DB::val("SELECT COUNT(*) FROM emt_recipients WHERE campaign_id = ? AND status = 'pending'", array($id));
    }

    public static function stats($id)
    {
        $id = (int) $id;
        $counts = array('pending' => 0, 'sent' => 0, 'failed' => 0, 'invalid' => 0, 'bounced' => 0, 'skipped' => 0);
        foreach (DB::all('SELECT status, COUNT(*) n FROM emt_recipients WHERE campaign_id = ? GROUP BY status', array($id)) as $r) {
            $counts[$r['status']] = (int) $r['n'];
        }
        $agg = DB::one(
            "SELECT SUM(opened_at IS NOT NULL) opened, COALESCE(SUM(opens),0) opens_total,
                    SUM(clicked_at IS NOT NULL) clicked, COALESCE(SUM(clicks),0) clicks_total,
                    SUM(unsubscribed_at IS NOT NULL) unsubscribed, SUM(complained_at IS NOT NULL) complained,
                    SUM(bounce_type = 'hard') hard, SUM(bounce_type = 'soft') soft,
                    SUM(status = 'pending' AND attempts > 0) retrying
             FROM emt_recipients WHERE campaign_id = ?",
            array($id)
        );
        $total = array_sum($counts);
        $delivered = $counts['sent'];
        $attempted = $counts['sent'] + $counts['bounced'] + $counts['failed'];
        $s = array(
            'total' => $total,
            'pending' => $counts['pending'],
            'sent' => $counts['sent'],
            'failed' => $counts['failed'],
            'invalid' => $counts['invalid'],
            'bounced' => $counts['bounced'],
            'hard_bounces' => (int) $agg['hard'],
            'soft_bounces' => (int) $agg['soft'],
            'skipped' => $counts['skipped'],
            'retrying' => (int) $agg['retrying'],
            'processed' => $total - $counts['pending'],
            'opened' => (int) $agg['opened'],
            'opens_total' => (int) $agg['opens_total'],
            'clicked' => (int) $agg['clicked'],
            'clicks_total' => (int) $agg['clicks_total'],
            'unsubscribed' => (int) $agg['unsubscribed'],
            'complained' => (int) $agg['complained'],
        );
        $s['open_rate'] = $delivered ? round($s['opened'] / $delivered * 100, 1) : 0;
        $s['click_rate'] = $delivered ? round($s['clicked'] / $delivered * 100, 1) : 0;
        $s['bounce_rate'] = $attempted ? round($counts['bounced'] / $attempted * 100, 1) : 0;
        $s['delivery_rate'] = $attempted ? round($delivered / $attempted * 100, 1) : 0;
        $s['progress'] = $total ? round($s['processed'] / $total * 100, 1) : 0;
        return $s;
    }

    public static function pause($id)
    {
        return DB::exec("UPDATE emt_campaigns SET status = 'paused', updated_at = ? WHERE id = ? AND status IN ('sending','scheduled')", array(Util::now(), (int) $id)) > 0;
    }

    public static function resume($id)
    {
        $now = Util::now();
        return DB::exec(
            "UPDATE emt_campaigns SET status = 'sending', last_error = NULL, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status = 'paused'",
            array($now, $now, (int) $id)
        ) > 0;
    }

    /** Stops a campaign for good. Scheduled campaigns go back to draft instead. */
    public static function cancel($id)
    {
        $c = self::find($id);
        if (!$c) {
            return false;
        }
        $now = Util::now();
        if ($c['status'] === 'scheduled') {
            DB::exec('DELETE FROM emt_recipients WHERE campaign_id = ?', array($c['id']));
            DB::exec('DELETE FROM emt_links WHERE campaign_id = ?', array($c['id']));
            DB::update('emt_campaigns', array('status' => 'draft', 'scheduled_at' => null, 'total' => 0, 'updated_at' => $now), 'id = ?', array($c['id']));
            return true;
        }
        if (!in_array($c['status'], array('sending', 'paused'), true)) {
            return false;
        }
        DB::exec("UPDATE emt_recipients SET status = 'skipped', error = 'Campaign cancelled' WHERE campaign_id = ? AND status = 'pending'", array($c['id']));
        DB::update('emt_campaigns', array('status' => 'cancelled', 'completed_at' => $now, 'updated_at' => $now), 'id = ?', array($c['id']));
        return true;
    }

    public static function duplicate($id)
    {
        $c = self::find($id);
        if (!$c) {
            return 0;
        }
        $now = Util::now();
        $newId = DB::insert('emt_campaigns', array(
            'name' => Util::truncate('Copy of ' . $c['name'], 190),
            'subject' => $c['subject'],
            'preheader' => $c['preheader'],
            'from_name' => $c['from_name'],
            'from_email' => $c['from_email'],
            'reply_to' => $c['reply_to'],
            'html' => $c['html'],
            'text_body' => $c['text_body'],
            'track_opens' => $c['track_opens'],
            'track_clicks' => $c['track_clicks'],
            'status' => 'draft',
            'created_at' => $now,
            'updated_at' => $now,
        ));
        foreach (self::listIds($id) as $lid) {
            DB::insert('emt_campaign_lists', array('campaign_id' => $newId, 'list_id' => $lid));
        }
        return $newId;
    }

    /** Marks a sending campaign as completed when nothing is left in its queue. */
    public static function maybeComplete($id)
    {
        $pending = (int) DB::val("SELECT COUNT(*) FROM emt_recipients WHERE campaign_id = ? AND status = 'pending'", array((int) $id));
        if ($pending === 0) {
            DB::exec(
                "UPDATE emt_campaigns SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'sending'",
                array(Util::now(), Util::now(), (int) $id)
            );
            return true;
        }
        return false;
    }

    /** Scheduled campaigns whose time has come start sending. */
    public static function promoteScheduled()
    {
        $now = Util::now();
        return DB::exec(
            "UPDATE emt_campaigns SET status = 'sending', started_at = ?, updated_at = ? WHERE status = 'scheduled' AND scheduled_at <= ?",
            array($now, $now, $now)
        );
    }
}
