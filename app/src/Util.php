<?php
defined('EMT') or exit;

class Util
{
    /** Current UTC timestamp in MySQL DATETIME format. */
    public static function now($offsetSeconds = 0)
    {
        return gmdate('Y-m-d H:i:s', time() + (int) $offsetSeconds);
    }

    /** Normalises an email address (trim + lowercase). */
    public static function normalizeEmail($email)
    {
        $email = trim((string) $email, " \t\n\r\0\x0B<>\"'`;,");
        return strtolower($email);
    }

    /** Strict-ish syntax validation for a (normalised) email address. */
    public static function isValidEmail($email)
    {
        if ($email === '' || strlen($email) > 191) {
            return false;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        $domain = self::emailDomain($email);
        // Require a dot in the domain and a sane TLD.
        if (strpos($domain, '.') === false || !preg_match('/\.[a-z]{2,63}$/i', $domain)) {
            return false;
        }
        return true;
    }

    public static function emailDomain($email)
    {
        $at = strrpos($email, '@');
        return $at === false ? '' : strtolower(substr($email, $at + 1));
    }

    public static function h($s)
    {
        return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public static function clientIp()
    {
        return isset($_SERVER['REMOTE_ADDR']) ? substr((string) $_SERVER['REMOTE_ADDR'], 0, 45) : '0.0.0.0';
    }

    public static function isHttps()
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
            return true;
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
            return true;
        }
        return isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443;
    }

    /** Best guess of the public base URL of this installation (no trailing slash). */
    public static function guessBaseUrl()
    {
        $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
        $dir = isset($_SERVER['SCRIPT_NAME']) ? rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') : '';
        return (self::isHttps() ? 'https' : 'http') . '://' . $host . $dir;
    }

    /** Converts an HTML email into a readable plain-text alternative. */
    public static function htmlToText($html)
    {
        $html = preg_replace('#<(head|style|script|title)\b[^>]*>.*?</\1>#is', '', (string) $html);
        // Links: "text (url)"
        $html = preg_replace_callback('#<a\b[^>]*href\s*=\s*(["\'])(.*?)\1[^>]*>(.*?)</a>#is', function ($m) {
            $text = trim(strip_tags($m[3]));
            $url = html_entity_decode($m[2], ENT_QUOTES, 'UTF-8');
            if ($text === '' || $text === $url || stripos($url, 'mailto:') === 0) {
                return $text !== '' ? $text : $url;
            }
            return $text . ' (' . $url . ')';
        }, $html);
        $html = preg_replace('#<br\s*/?>#i', "\n", $html);
        $html = preg_replace('#</(p|div|h[1-6]|tr|table|li|blockquote|section|article|header|footer)>#i', "\n\n", $html);
        $html = preg_replace('#<li\b[^>]*>#i', '• ', $html);
        $html = preg_replace('#<hr\b[^>]*>#i', "\n----------------------------------------\n", $html);
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES, 'UTF-8');
        $text = str_replace("\xC2\xA0", ' ', $text);
        $text = preg_replace("/[ \t]+/", ' ', $text);
        $text = preg_replace("/ *\n */", "\n", $text);
        $text = preg_replace("/\n{3,}/", "\n\n", $text);
        return trim($text);
    }

    public static function randomHex($bytes = 16)
    {
        return bin2hex(random_bytes($bytes));
    }

    /** Parses a user-provided local datetime string into UTC, using the given timezone. */
    public static function localToUtc($value, $tz)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        try {
            $dt = new DateTime(str_replace('T', ' ', $value), new DateTimeZone($tz ?: 'UTC'));
        } catch (Exception $e) {
            return null;
        }
        $dt->setTimezone(new DateTimeZone('UTC'));
        return $dt->format('Y-m-d H:i:s');
    }

    /** Converts a stored UTC DATETIME into an ISO-8601 string the browser can parse. */
    public static function iso($utc)
    {
        if (!$utc) {
            return null;
        }
        return str_replace(' ', 'T', $utc) . 'Z';
    }

    public static function truncate($s, $len)
    {
        $s = (string) $s;
        if (function_exists('mb_substr')) {
            return mb_strlen($s) > $len ? mb_substr($s, 0, $len - 1) . '…' : $s;
        }
        return strlen($s) > $len ? substr($s, 0, $len - 3) . '...' : $s;
    }

    public static function jsonResponse($data, $status = 200)
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('X-Content-Type-Options: nosniff');
        }
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        exit;
    }

    /** Streams a CSV download. $rows is iterable of arrays. */
    public static function csvDownload($filename, array $header, $rows)
    {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]+/', '-', $filename) . '"');
        header('Cache-Control: no-store');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel opens it correctly
        fputcsv($out, $header, ',', '"', '\\');
        foreach ($rows as $row) {
            fputcsv($out, array_values($row), ',', '"', '\\');
        }
        fclose($out);
        exit;
    }

    /** Tries to raise PHP limits for long operations; silently ignored when not allowed. */
    public static function longRunning($seconds = 300)
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit($seconds);
        }
        @ini_set('memory_limit', '256M');
        if (function_exists('ignore_user_abort')) {
            @ignore_user_abort(true);
        }
    }
}
