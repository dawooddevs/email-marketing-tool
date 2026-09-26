<?php
defined('EMT') or exit;

/**
 * Recognises delivery failure notifications (DSN / NDR bounces), spam complaints (ARF)
 * and "unsubscribe" replies, and extracts the failed address + reason.
 */
class BounceParser
{
    const HARD_PATTERNS = '/user unknown|unknown user|no such (user|mailbox|recipient|address)|does(n\'t| not) exist|not exist|invalid (recipient|mailbox|address)|address not found|recipient not found|recipient unknown|mailbox (unavailable|not found|disabled|does not exist)|account (is |has been )?(disabled|inactive|suspended|closed|terminated|deleted)|unrouteable|unroutable|host not found|domain not found|no mx|nxdomain|name or service not known|recipient address rejected|undeliverable address|permanent error|permanent failure|no longer (active|available)|bad destination mailbox|not a valid|isn\'t a valid|could not be found/i';
    const SOFT_PATTERNS = '/mailbox (is )?full|over ?quota|quota exceeded|exceeded (storage|quota)|insufficient (system )?storage|temporar|try again|greylist|deferred|timed out|timeout|out of storage|too many connections|rate limit|server busy|mailbox size/i';

    /**
     * @return array|null [type, email, status, diagnostic, token, subject]; type is hard|soft|complaint|unsubscribe|delayed
     */
    public static function parse($raw)
    {
        $raw = str_replace("\r\n", "\n", (string) $raw);
        list($headerText, $body) = self::split($raw);
        $h = self::parseHeaders($headerText);
        $subject = self::decodeHeader(self::hv($h, 'subject'));
        $from = self::hv($h, 'from');
        $ctype = self::hv($h, 'content-type');
        $text = self::flatten($headerText, $body);
        $all = $text . "\n" . $body;

        $result = array(
            'type' => null,
            'email' => '',
            'status' => '',
            'diagnostic' => '',
            'token' => self::findToken($raw),
            'subject' => Util::truncate($subject, 250),
        );

        // Spam complaint (Abuse Reporting Format)
        if ((stripos($ctype, 'multipart/report') !== false && stripos($ctype, 'feedback-report') !== false)
            || preg_match('/^Feedback-Type:\s*abuse/mi', $all)) {
            $result['type'] = 'complaint';
            $result['email'] = self::firstEmail(array(
                self::match('/^Original-Rcpt-To:\s*<?([^\s<>]+@[^\s<>]+)>?/mi', $all),
                self::match('/^Removal-Recipient:\s*<?([^\s<>]+@[^\s<>]+)>?/mi', $all),
                self::embeddedTo($body),
            ));
            $result['diagnostic'] = 'Recipient marked the email as spam';
            return $result;
        }

        if (!self::looksLikeBounce($h, $subject)) {
            if (preg_match('/^\s*((re|aw|fw|fwd)\s*:\s*)*unsubscribe\b/i', $subject)) {
                $result['type'] = 'unsubscribe';
                $result['email'] = self::firstEmail(array(self::addressFrom(self::hv($h, 'reply-to')), self::addressFrom($from)));
                $result['diagnostic'] = 'Unsubscribe request received by email';
                return $result['email'] !== '' ? $result : null;
            }
            return null;
        }

        $action = strtolower(self::match('/^Action:\s*([a-z]+)/mi', $all));
        $status = self::match('/^Status:\s*([245]\.\d{1,3}\.\d{1,3})/mi', $all);
        $diag = self::match('/^Diagnostic-Code:\s*(?:[a-z0-9-]+;\s*)?(.+(?:\n[ \t]+.+)*)/mi', $all);
        $diag = trim(preg_replace('/\s+/', ' ', $diag));

        // "Delivery delayed" warnings are not final — ignore them.
        if ($action === 'delayed' || ($action === '' && preg_match('/delay|delayed|still (being )?(retried|undelivered)|will (continue|retry)/i', $subject) && !preg_match('/fail/i', $subject))) {
            $result['type'] = 'delayed';
            return $result;
        }

        if ($status === '') {
            $status = self::match('/\b[45]\d\d[ -]([45]\.\d{1,3}\.\d{1,3})\b/', $all);
        }
        if ($diag === '') {
            $diag = self::match('/((?:550|551|552|553|554|450|451|452|421)[ -].{5,200})/', $text);
            if ($diag === '') {
                $diag = self::match('/((?:' . substr(self::HARD_PATTERNS, 1, -2) . ').{0,120})/i', $text);
            }
            $diag = trim(preg_replace('/\s+/', ' ', $diag));
        }

        $result['email'] = self::firstEmail(array(
            self::match('/^Final-Recipient:\s*(?:rfc822;\s*)?<?([^\s<>;]+@[^\s<>;]+)>?/mi', $all),
            self::match('/^Original-Recipient:\s*(?:rfc822;\s*)?<?([^\s<>;]+@[^\s<>;]+)>?/mi', $all),
            self::hv($h, 'x-failed-recipients'),
            self::match('/following (?:address\(es\)|addresses|recipients?)[^\n]*failed:?\s*\n\s*<?([^\s<>]+@[^\s<>]+)>?/i', $text),
            self::match('/(?:wasn\'t|was not|couldn\'t be|could not be) delivered to\s*<?([^\s<>]+@[^\s<>]+?)>?[\s.,]/i', $text),
            self::match('/<([^\s<>]+@[^\s<>]+)>:\s*\n?\s*(?:host|Recipient|User|Mailbox|The email account)/i', $text),
            self::embeddedTo($body),
        ));
        $result['status'] = $status;
        $result['diagnostic'] = Util::truncate($diag !== '' ? $diag : $subject, 480);
        $result['type'] = self::classify($status, $diag . ' ' . $text);
        return $result;
    }

    public static function classify($status, $text)
    {
        if ($status !== '') {
            if ($status[0] === '4') {
                return 'soft';
            }
            if ($status === '5.2.2' || $status === '5.2.1' && preg_match(self::SOFT_PATTERNS, $text)) {
                return 'soft';
            }
            if (strpos($status, '5.7.') === 0 || strpos($status, '5.3.') === 0) {
                // Policy / spam / system problems: the address itself is probably fine.
                return 'soft';
            }
            if (strpos($status, '5.1.') === 0 || strpos($status, '5.4.') === 0) {
                return 'hard';
            }
            return preg_match(self::SOFT_PATTERNS, $text) && !preg_match(self::HARD_PATTERNS, $text) ? 'soft' : 'hard';
        }
        if (preg_match(self::HARD_PATTERNS, $text)) {
            return 'hard';
        }
        return 'soft';
    }

    /** Quick check on headers only (used before downloading a whole message). */
    public static function headersLookInteresting($headerText)
    {
        $h = self::parseHeaders(str_replace("\r\n", "\n", $headerText));
        $subject = self::decodeHeader(self::hv($h, 'subject'));
        if (self::looksLikeBounce($h, $subject)) {
            return true;
        }
        $ctype = self::hv($h, 'content-type');
        if (stripos($ctype, 'multipart/report') !== false) {
            return true;
        }
        return (bool) preg_match('/^\s*((re|aw|fw|fwd)\s*:\s*)*unsubscribe\b/i', $subject);
    }

    private static function looksLikeBounce(array $h, $subject)
    {
        $ctype = self::hv($h, 'content-type');
        if (stripos($ctype, 'multipart/report') !== false && stripos($ctype, 'delivery-status') !== false) {
            return true;
        }
        if (self::hv($h, 'x-failed-recipients') !== '') {
            return true;
        }
        $from = self::hv($h, 'from');
        $fromBounce = (bool) preg_match('/mailer-daemon|postmaster|mail delivery (subsystem|system)|mail ?delivery|mdaemon/i', $from);
        $subjBounce = (bool) preg_match('/undeliver|undelivered|delivery (status notification|failure|failed|has failed|incomplete|problem)|returned mail|failure notice|mail delivery failed|could not be delivered|non.?delivery|not delivered|delivery report|message rejected|returned to sender|address not found/i', $subject);
        return $subjBounce || ($fromBounce && !preg_match('/out of office|automatic reply|auto.?reply|vacation/i', $subject));
    }

    private static function split($raw)
    {
        $pos = strpos($raw, "\n\n");
        if ($pos === false) {
            return array($raw, '');
        }
        return array(substr($raw, 0, $pos), substr($raw, $pos + 2));
    }

    public static function parseHeaders($headerText)
    {
        $headers = array();
        $unfolded = preg_replace("/\n[ \t]+/", ' ', $headerText);
        foreach (explode("\n", $unfolded) as $line) {
            $p = strpos($line, ':');
            if ($p === false) {
                continue;
            }
            $k = strtolower(trim(substr($line, 0, $p)));
            if (!isset($headers[$k])) {
                $headers[$k] = trim(substr($line, $p + 1));
            }
        }
        return $headers;
    }

    private static function hv(array $h, $k)
    {
        return isset($h[$k]) ? $h[$k] : '';
    }

    public static function decodeHeader($value)
    {
        if (strpos($value, '=?') === false) {
            return $value;
        }
        if (function_exists('iconv_mime_decode')) {
            $d = @iconv_mime_decode($value, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
            if ($d !== false) {
                return $d;
            }
        }
        if (function_exists('mb_decode_mimeheader')) {
            return mb_decode_mimeheader($value);
        }
        return $value;
    }

    /** Decodes a MIME message into searchable plain text (all parts, decoded). */
    private static function flatten($headerText, $body, $depth = 0)
    {
        if ($depth > 5) {
            return '';
        }
        $h = self::parseHeaders($headerText);
        $ctype = self::hv($h, 'content-type');
        if ($ctype === '') {
            $ctype = 'text/plain';
        }
        if (stripos($ctype, 'multipart/') === 0 && preg_match('/boundary\s*=\s*"?([^";]+)"?/i', $ctype, $m)) {
            $boundary = trim($m[1]);
            $parts = explode('--' . $boundary, $body);
            array_shift($parts); // preamble
            $out = '';
            foreach ($parts as $part) {
                if (strpos($part, '--') === 0) {
                    break; // closing boundary
                }
                $part = ltrim($part, "\n");
                list($ph, $pb) = self::split($part);
                if (strpos($part, "\n\n") === false) {
                    $ph = '';
                    $pb = $part;
                }
                $out .= self::flatten($ph, $pb, $depth + 1) . "\n";
            }
            return $out;
        }
        $enc = strtolower(self::hv($h, 'content-transfer-encoding'));
        if ($enc === 'base64') {
            $decoded = base64_decode(preg_replace('/\s+/', '', $body), false);
            $body = $decoded !== false ? $decoded : $body;
        } elseif ($enc === 'quoted-printable') {
            $body = quoted_printable_decode($body);
        }
        if (stripos($ctype, 'text/html') === 0) {
            $body = Util::htmlToText($body);
        }
        return $body;
    }

    private static function findToken($raw)
    {
        if (preg_match('/X-EMT-ID:\s*(\d{1,10}\.[a-f0-9]{16})/i', $raw, $m)) {
            return $m[1];
        }
        if (preg_match('/<emt-(\d{1,10})-([a-f0-9]{16})-[a-f0-9]+@/i', $raw, $m)) {
            return $m[1] . '.' . strtolower($m[2]);
        }
        return '';
    }

    /** The "To:" header of the original message quoted inside the bounce. */
    private static function embeddedTo($body)
    {
        if (preg_match('/^To:\s*(.+)$/mi', $body, $m)) {
            return self::addressFrom($m[1]);
        }
        return '';
    }

    private static function addressFrom($value)
    {
        if (preg_match('/<([^\s<>]+@[^\s<>]+)>/', $value, $m)) {
            return $m[1];
        }
        if (preg_match('/([^\s<>"\',;]+@[^\s<>"\',;]+)/', $value, $m)) {
            return $m[1];
        }
        return '';
    }

    private static function firstEmail(array $candidates)
    {
        foreach ($candidates as $c) {
            $c = Util::normalizeEmail(self::addressFrom((string) $c));
            if ($c !== '' && Util::isValidEmail($c) && !preg_match('/^(mailer-daemon|postmaster)@/i', $c)) {
                return $c;
            }
        }
        return '';
    }

    private static function match($re, $text)
    {
        return preg_match($re, $text, $m) ? trim($m[1]) : '';
    }
}
