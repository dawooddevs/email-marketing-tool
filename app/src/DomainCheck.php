<?php
defined('EMT') or exit;

/**
 * Checks whether an email domain can receive mail (has MX / A records).
 * Results are cached in emt_domains so every domain is only resolved once in a while.
 */
class DomainCheck
{
    const VALID = 'valid';
    const INVALID = 'invalid';
    const UNKNOWN = 'unknown';

    private static $memo = array();
    private static $resolverOk = null;

    /** Big mailbox providers — never waste a DNS lookup on them. */
    private static $known = array(
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'outlook.com',
        'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
        'protonmail.com', 'proton.me', 'zoho.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.com', 'yandex.ru',
        'web.de', 'comcast.net', 'verizon.net', 'att.net', 'qq.com', '163.com', 'rocketmail.com',
    );

    public static function available()
    {
        return function_exists('checkdnsrr');
    }

    /** @return string one of VALID / INVALID / UNKNOWN */
    public static function check($domain, $useCache = true)
    {
        $domain = strtolower(trim($domain));
        if ($domain === '' || in_array($domain, self::$known, true)) {
            return $domain === '' ? self::INVALID : self::VALID;
        }
        if (isset(self::$memo[$domain])) {
            return self::$memo[$domain];
        }
        if (!self::available()) {
            return self::UNKNOWN;
        }
        if ($useCache) {
            $row = DB::one('SELECT valid, checked_at FROM emt_domains WHERE domain = ?', array($domain));
            if ($row) {
                $maxAge = $row['valid'] ? 30 * 86400 : 3 * 86400;
                if (strtotime($row['checked_at'] . ' UTC') > time() - $maxAge) {
                    return self::$memo[$domain] = ($row['valid'] ? self::VALID : self::INVALID);
                }
            }
        }
        $result = self::resolve($domain);
        if ($result === self::INVALID) {
            // Double check a moment later, and make sure DNS itself works, before condemning a domain.
            usleep(300000);
            $result = self::resolve($domain);
            if ($result === self::INVALID && !self::resolverWorks()) {
                $result = self::UNKNOWN;
            }
        }
        if ($result !== self::UNKNOWN) {
            DB::q(
                'INSERT INTO emt_domains (domain, valid, checked_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valid = VALUES(valid), checked_at = VALUES(checked_at)',
                array($domain, $result === self::VALID ? 1 : 0, Util::now())
            );
        }
        return self::$memo[$domain] = $result;
    }

    private static function resolve($domain)
    {
        $ascii = $domain;
        if (function_exists('idn_to_ascii') && preg_match('/[^\x20-\x7e]/', $domain)) {
            $conv = defined('INTL_IDNA_VARIANT_UTS46') ? @idn_to_ascii($domain, 0, INTL_IDNA_VARIANT_UTS46) : @idn_to_ascii($domain);
            if ($conv) {
                $ascii = $conv;
            }
        }
        $fqdn = rtrim($ascii, '.') . '.';
        if (@checkdnsrr($fqdn, 'MX')) {
            // RFC 7505 "null MX" (a single MX pointing to ".") means the domain accepts no mail.
            if (function_exists('dns_get_record')) {
                $mx = @dns_get_record($fqdn, DNS_MX);
                if (is_array($mx) && count($mx) === 1 && isset($mx[0]['target']) && trim($mx[0]['target'], '. ') === '') {
                    return self::INVALID;
                }
            }
            return self::VALID;
        }
        if (@checkdnsrr($fqdn, 'A') || @checkdnsrr($fqdn, 'AAAA')) {
            return self::VALID;
        }
        return self::INVALID;
    }

    private static function resolverWorks()
    {
        if (self::$resolverOk === null) {
            self::$resolverOk = @checkdnsrr('gmail.com.', 'MX') || @checkdnsrr('outlook.com.', 'MX');
        }
        return self::$resolverOk;
    }
}
