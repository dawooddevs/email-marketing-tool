<?php
defined('EMT') or exit;

/**
 * The sending engine. Called by cron.php (every 5 minutes) and by the admin
 * panel's "send from browser" pump. It sends queued emails while respecting
 * the hourly/daily limits of the mail server.
 */
class Engine
{
    private static function lockName()
    {
        $config = emt_config();
        return 'emt_engine_' . substr(md5($config['db']['name'] . '|' . EMT_ROOT), 0, 16);
    }

    private static function acquireLock()
    {
        return (int) DB::val('SELECT GET_LOCK(?, 0)', array(self::lockName())) === 1;
    }

    private static function releaseLock()
    {
        try {
            DB::val('SELECT RELEASE_LOCK(?)', array(self::lockName()));
        } catch (Exception $e) {
            // ignore
        }
    }

    public static function sentSince($seconds)
    {
        return (int) DB::val('SELECT COUNT(*) FROM emt_send_log WHERE sent_at >= ?', array(Util::now(-$seconds)));
    }

    /** How many emails may be sent right now according to the hourly/daily limits (null = unlimited). */
    public static function quota()
    {
        $quota = null;
        $hourly = Settings::int('hourly_limit');
        if ($hourly > 0) {
            $quota = max(0, $hourly - self::sentSince(3600));
        }
        $daily = Settings::int('daily_limit');
        if ($daily > 0) {
            $left = max(0, $daily - self::sentSince(86400));
            $quota = $quota === null ? $left : min($quota, $left);
        }
        return $quota;
    }

    /**
     * Runs one sending cycle.
     * @param string $source cron | web
     * @param int|null $maxSeconds wall-clock budget
     */
    public static function run($source = 'cron', $maxSeconds = null)
    {
        $started = microtime(true);
        $summary = array('status' => 'idle', 'sent' => 0, 'failed' => 0, 'invalid' => 0, 'bounced' => 0, 'deferred' => 0, 'skipped' => 0, 'message' => '');

        if (!self::acquireLock()) {
            $summary['status'] = 'busy';
            $summary['message'] = 'Another sending process is already running.';
            return $summary;
        }
        try {
            Settings::set($source === 'cron' ? 'cron_last_run' : 'engine_last_run', Util::now());
            if ($maxSeconds === null) {
                $maxSeconds = $source === 'cron' ? max(20, Settings::int('cron_max_seconds')) : 20;
            }
            $deadline = $started + $maxSeconds;

            Campaigns::promoteScheduled();
            self::housekeeping();

            $campaigns = DB::all("SELECT * FROM emt_campaigns WHERE status = 'sending' ORDER BY started_at, id");
            if ($campaigns) {
                self::sendQueued($campaigns, $deadline, $summary);
            }

            // Check the bounce mailbox from cron (at most every 10 minutes).
            if ($source === 'cron' && Settings::bool('pop_enabled') && microtime(true) < $deadline + 60) {
                $last = (string) Settings::get('bounce_last_check');
                if ($last === '' || strtotime($last . ' UTC') < time() - 600) {
                    try {
                        $b = Bounces::check(150);
                        $summary['bounces'] = $b;
                    } catch (Exception $e) {
                        $summary['bounces'] = array('error' => $e->getMessage());
                    }
                }
            }
        } finally {
            self::releaseLock();
        }
        $summary['seconds'] = round(microtime(true) - $started, 1);
        return $summary;
    }

    private static function sendQueued(array $campaigns, $deadline, array &$summary)
    {
        $quota = self::quota();
        $batch = max(1, Settings::int('batch_size'));
        $quota = $quota === null ? $batch : min($quota, $batch);
        if ($quota <= 0) {
            $summary['status'] = 'throttled';
            $summary['message'] = 'Sending limit reached — waiting for the hourly/daily limit to reset.';
            return;
        }
        $summary['status'] = 'sending';
        $delayUs = max(0, Settings::int('delay_ms')) * 1000;
        $pauseAfter = max(0, Settings::int('pause_after_failures'));
        $checkDomains = Settings::bool('check_domains');
        $mailer = null;
        $attemptedSends = 0;

        foreach ($campaigns as $c) {
            $cid = (int) $c['id'];
            $linkMap = array();
            foreach (DB::all('SELECT id, url FROM emt_links WHERE campaign_id = ?', array($cid)) as $l) {
                $linkMap[$l['url']] = (int) $l['id'];
            }
            $consecutiveFailures = 0;
            $processed = 0;

            while ($quota > 0 && microtime(true) < $deadline) {
                $rows = DB::all(
                    "SELECT id, email, name, attempts FROM emt_recipients
                     WHERE campaign_id = ? AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
                     ORDER BY id LIMIT " . (int) min(50, max($quota, 10)),
                    array($cid, Util::now())
                );
                if (!$rows) {
                    Campaigns::maybeComplete($cid);
                    continue 2;
                }
                foreach ($rows as $r) {
                    if ($quota <= 0 || microtime(true) >= $deadline) {
                        break 2;
                    }
                    // Respect pause / cancel clicks made while we are running.
                    if ($processed > 0 && $processed % 10 === 0) {
                        $status = DB::val('SELECT status FROM emt_campaigns WHERE id = ?', array($cid));
                        if ($status !== 'sending') {
                            continue 3;
                        }
                    }
                    $processed++;
                    $email = $r['email'];

                    $reason = Suppression::reasonFor($email);
                    if ($reason) {
                        self::mark($r['id'], 'skipped', 'Suppressed: ' . $reason);
                        $summary['skipped']++;
                        continue;
                    }
                    if (!Util::isValidEmail($email)) {
                        self::mark($r['id'], 'invalid', 'Invalid email address format');
                        Suppression::add($email, 'invalid', 'Invalid email address format', $cid);
                        $summary['invalid']++;
                        continue;
                    }
                    if ($checkDomains && DomainCheck::check(Util::emailDomain($email)) === DomainCheck::INVALID) {
                        $msg = 'Domain "' . Util::emailDomain($email) . '" does not exist or cannot receive email';
                        self::mark($r['id'], 'invalid', $msg);
                        Suppression::add($email, 'invalid', $msg, $cid);
                        $summary['invalid']++;
                        continue;
                    }

                    if ($attemptedSends > 0 && $delayUs > 0) {
                        usleep($delayUs);
                    }
                    if ($mailer === null) {
                        $mailer = new Mailer();
                    }
                    list($subject, $html, $text, $unsub) = Mailer::render($c, $r, $linkMap);
                    $err = $mailer->send($c, $r, $subject, $html, $text, $unsub);
                    $attemptedSends++;
                    $quota--;
                    DB::insert('emt_send_log', array('sent_at' => Util::now()));

                    if ($err === null) {
                        DB::exec("UPDATE emt_recipients SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = NULL WHERE id = ?", array(Util::now(), $r['id']));
                        $summary['sent']++;
                        if ($consecutiveFailures === 0 && $summary['sent'] === 1 || !empty($c['last_error'])) {
                            // Sending works again: clear a stale "mail server problem" note on the campaign.
                            DB::exec("UPDATE emt_campaigns SET last_error = NULL WHERE id = ? AND last_error LIKE 'Mail server problem%'", array($cid));
                            $c['last_error'] = null;
                        }
                        $consecutiveFailures = 0;
                        if (Settings::get('engine_error') !== '') {
                            Settings::set('engine_error', '');
                        }
                        continue;
                    }

                    list($kind, $message) = $err;
                    $message = Util::truncate($message, 480);
                    switch ($kind) {
                        case Mailer::ERR_GLOBAL:
                            // Not this recipient's fault — leave it queued and stop until next run.
                            Settings::set('engine_error', $message);
                            Settings::set('engine_error_at', Util::now());
                            DB::exec('UPDATE emt_campaigns SET last_error = ? WHERE id = ?', array('Mail server problem: ' . $message, $cid));
                            $summary['status'] = 'error';
                            $summary['message'] = $message;
                            break 4;
                        case Mailer::ERR_TEMP:
                            $attempts = (int) $r['attempts'] + 1;
                            if ($attempts >= 3) {
                                DB::exec("UPDATE emt_recipients SET status = 'failed', attempts = ?, error = ? WHERE id = ?", array($attempts, 'Gave up after 3 attempts: ' . $message, $r['id']));
                                $summary['failed']++;
                            } else {
                                DB::exec(
                                    'UPDATE emt_recipients SET attempts = ?, next_attempt_at = ?, error = ? WHERE id = ?',
                                    array($attempts, Util::now(900 * $attempts), 'Temporary error (will retry): ' . $message, $r['id'])
                                );
                                $summary['deferred']++;
                            }
                            break;
                        case Mailer::ERR_HARD:
                            DB::exec(
                                "UPDATE emt_recipients SET status = 'bounced', bounce_type = 'hard', bounced_at = ?, attempts = attempts + 1, error = ? WHERE id = ?",
                                array(Util::now(), $message, $r['id'])
                            );
                            Suppression::add($email, 'bounced', $message, $cid);
                            $summary['bounced']++;
                            break;
                        case Mailer::ERR_INVALID:
                            self::mark($r['id'], 'invalid', $message);
                            Suppression::add($email, 'invalid', $message, $cid);
                            $summary['invalid']++;
                            break;
                        default:
                            DB::exec("UPDATE emt_recipients SET status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?", array($message, $r['id']));
                            $summary['failed']++;
                            $consecutiveFailures++;
                            if ($pauseAfter > 0 && $consecutiveFailures >= $pauseAfter) {
                                DB::exec(
                                    "UPDATE emt_campaigns SET status = 'paused', last_error = ?, updated_at = ? WHERE id = ?",
                                    array('Paused automatically after ' . $consecutiveFailures . ' failures in a row. Last error: ' . $message, Util::now(), $cid)
                                );
                                continue 4;
                            }
                    }
                }
            }
            if ($quota <= 0 || microtime(true) >= $deadline) {
                break;
            }
        }
        if ($mailer) {
            $mailer->close();
        }
        $stillQueued = (int) DB::val(
            "SELECT COUNT(*) FROM emt_recipients r JOIN emt_campaigns c ON c.id = r.campaign_id WHERE c.status = 'sending' AND r.status = 'pending'"
        );
        if ($summary['status'] === 'sending' && $stillQueued > 0 && self::quota() === 0) {
            $summary['message'] = 'Hourly/daily limit reached; the rest will be sent automatically later.';
        }
    }

    private static function mark($rid, $status, $error)
    {
        DB::exec('UPDATE emt_recipients SET status = ?, error = ? WHERE id = ?', array($status, Util::truncate($error, 480), (int) $rid));
    }

    private static function housekeeping()
    {
        // Cheap cleanups, run at most once an hour.
        $last = (string) Settings::get('housekeeping_at', '');
        if ($last !== '' && strtotime($last . ' UTC') > time() - 3600) {
            return;
        }
        DB::exec('DELETE FROM emt_send_log WHERE sent_at < ?', array(Util::now(-3 * 86400)));
        DB::exec('DELETE FROM emt_login_attempts WHERE attempted_at < ?', array(Util::now(-86400)));
        DB::exec('DELETE FROM emt_mailbox_seen WHERE seen_at < ?', array(Util::now(-180 * 86400)));
        Settings::set('housekeeping_at', Util::now());
    }

    /** Engine status for the dashboard / top bar. */
    public static function status()
    {
        $cronLast = (string) Settings::get('cron_last_run');
        $webLast = (string) Settings::get('engine_last_run');
        $cronAge = $cronLast !== '' ? time() - strtotime($cronLast . ' UTC') : null;
        $sending = (int) DB::val("SELECT COUNT(*) FROM emt_campaigns WHERE status = 'sending'");
        $scheduled = (int) DB::val("SELECT COUNT(*) FROM emt_campaigns WHERE status = 'scheduled'");
        $pending = $sending ? (int) DB::val(
            "SELECT COUNT(*) FROM emt_recipients r JOIN emt_campaigns c ON c.id = r.campaign_id WHERE c.status = 'sending' AND r.status = 'pending'"
        ) : 0;
        return array(
            'sending_campaigns' => $sending,
            'scheduled_campaigns' => $scheduled,
            'pending' => $pending,
            'sent_last_hour' => self::sentSince(3600),
            'sent_last_day' => self::sentSince(86400),
            'hourly_limit' => Settings::int('hourly_limit'),
            'daily_limit' => Settings::int('daily_limit'),
            'cron_last_run' => Util::iso($cronLast ?: null),
            'cron_ok' => $cronAge !== null && $cronAge < 11 * 60,
            'web_last_run' => Util::iso($webLast ?: null),
            'engine_error' => (string) Settings::get('engine_error'),
            'engine_error_at' => Util::iso(Settings::get('engine_error_at') ?: null),
            'smtp_configured' => Settings::smtpConfigured(),
        );
    }
}
