<?php
defined('EMT') or exit;

/** Key/value settings stored in emt_settings. Secret keys are encrypted at rest. */
class Settings
{
    private static $cache = null;

    /** Keys whose values are encrypted in the database. */
    public static $secret = array('smtp_pass', 'pop_pass');

    public static function defaults()
    {
        return array(
            'app_url' => '',
            'timezone' => 'UTC',
            // Sender
            'from_name' => 'DaudDev',
            'from_email' => 'marketing@dauddev.com',
            'reply_to' => '',
            // SMTP
            'mailer' => 'smtp', // smtp | mail
            'smtp_host' => 'mail.spacemail.com',
            'smtp_port' => '465',
            'smtp_secure' => 'ssl', // ssl | tls | none
            'smtp_user' => 'marketing@dauddev.com',
            'smtp_pass' => '',
            // Throttling (Spacemail paid plans allow 500 emails/hour per mailbox)
            'hourly_limit' => '400',
            'daily_limit' => '0',
            'batch_size' => '40',
            'delay_ms' => '1500',
            'cron_max_seconds' => '240',
            'check_domains' => '1',
            'pause_after_failures' => '10',
            // Bounce mailbox (POP3)
            'pop_enabled' => '0',
            'pop_host' => 'mail.spacemail.com',
            'pop_port' => '995',
            'pop_secure' => 'ssl',
            'pop_user' => 'marketing@dauddev.com',
            'pop_pass' => '',
            'pop_delete' => '1',
            // Compliance & tracking
            'company_address' => '',
            'auto_footer' => '1',
            'default_track_opens' => '1',
            'default_track_clicks' => '1',
            // Internal state
            'cron_last_run' => '',
            'engine_last_run' => '',
            'engine_error' => '',
            'engine_error_at' => '',
            'bounce_last_check' => '',
            'bounce_last_result' => '',
            'last_test_email_at' => '',
        );
    }

    private static function load()
    {
        if (self::$cache === null) {
            self::$cache = self::defaults();
            foreach (DB::all('SELECT k, v FROM emt_settings') as $row) {
                self::$cache[$row['k']] = $row['v'];
            }
        }
    }

    public static function get($key, $default = null)
    {
        self::load();
        if (!array_key_exists($key, self::$cache)) {
            return $default;
        }
        $v = self::$cache[$key];
        if (in_array($key, self::$secret, true)) {
            return Crypto::decrypt($v);
        }
        return $v;
    }

    public static function int($key)
    {
        return (int) self::get($key, 0);
    }

    public static function bool($key)
    {
        return (string) self::get($key, '0') === '1';
    }

    public static function set($key, $value)
    {
        self::load();
        $value = (string) $value;
        $stored = in_array($key, self::$secret, true) ? Crypto::encrypt($value) : $value;
        DB::q('INSERT INTO emt_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', array($key, $stored));
        self::$cache[$key] = $stored;
    }

    public static function setMany(array $values)
    {
        foreach ($values as $k => $v) {
            self::set($k, $v);
        }
    }

    public static function reset()
    {
        self::$cache = null;
    }

    public static function appUrl()
    {
        $url = rtrim((string) self::get('app_url'), '/');
        return $url !== '' ? $url : rtrim(Util::guessBaseUrl(), '/');
    }

    public static function timezone()
    {
        $tz = (string) self::get('timezone', 'UTC');
        return in_array($tz, timezone_identifiers_list(), true) ? $tz : 'UTC';
    }

    public static function smtpConfigured()
    {
        if (self::get('mailer') === 'mail') {
            return true;
        }
        return self::get('smtp_host') !== '' && self::get('smtp_user') !== '' && self::get('smtp_pass') !== '';
    }
}
