<?php
defined('EMT') or exit;

/** Secret encryption (for stored SMTP/POP passwords) and URL signing. */
class Crypto
{
    private static function key()
    {
        $config = emt_config();
        if (!$config || empty($config['app_key'])) {
            throw new RuntimeException('Missing app_key in config.');
        }
        return hash('sha256', 'emt-enc|' . $config['app_key'], true);
    }

    public static function encrypt($plain)
    {
        $plain = (string) $plain;
        if ($plain === '') {
            return '';
        }
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt($stored)
    {
        $stored = (string) $stored;
        if ($stored === '' || strpos($stored, 'v1:') !== 0) {
            return $stored;
        }
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) < 29) {
            return '';
        }
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return $plain === false ? '' : $plain;
    }

    /** Short signature for public links (tracking / unsubscribe). */
    public static function sign($data)
    {
        $config = emt_config();
        return substr(hash_hmac('sha256', 'emt-sig|' . $data, $config['app_key']), 0, 16);
    }

    /** Builds the "<recipientId>.<signature>" token used in public URLs and headers. */
    public static function recipientToken($rid)
    {
        $rid = (int) $rid;
        return $rid . '.' . self::sign('r' . $rid);
    }

    /** Returns the recipient id for a valid token, or null. */
    public static function parseRecipientToken($token)
    {
        if (!is_string($token) || !preg_match('/^(\d{1,10})\.([a-f0-9]{16})$/', $token, $m)) {
            return null;
        }
        return hash_equals(self::sign('r' . $m[1]), $m[2]) ? (int) $m[1] : null;
    }
}
