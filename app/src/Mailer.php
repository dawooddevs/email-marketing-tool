<?php
defined('EMT') or exit;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailerException;

/**
 * Builds personalised messages for campaign recipients and delivers them over SMTP.
 */
class Mailer
{
    /** @var PHPMailer|null */
    private $mail = null;

    /** Result classification after a failed send. */
    const ERR_GLOBAL = 'global';       // connection / auth / sender problem: stop the run, retry later
    const ERR_TEMP = 'temporary';      // 4xx for this recipient: retry later
    const ERR_HARD = 'hard';           // mailbox does not exist: bounce + suppress
    const ERR_FAILED = 'failed';       // other permanent rejection
    const ERR_INVALID = 'invalid';     // address rejected as malformed

    public function __construct()
    {
        $this->mail = $this->createMailer();
    }

    /** @return PHPMailer */
    private function createMailer()
    {
        $mail = new PHPMailer(true);
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->Encoding = PHPMailer::ENCODING_QUOTED_PRINTABLE;
        $mail->XMailer = ' ';
        if (Settings::get('mailer') === 'mail') {
            $mail->isMail();
        } else {
            $mail->isSMTP();
            $mail->Host = trim((string) Settings::get('smtp_host'));
            $mail->Port = (int) Settings::get('smtp_port');
            $secure = Settings::get('smtp_secure');
            if ($secure === 'ssl') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } elseif ($secure === 'tls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } else {
                $mail->SMTPSecure = '';
                $mail->SMTPAutoTLS = false;
            }
            $mail->SMTPAuth = Settings::get('smtp_user') !== '';
            $mail->Username = (string) Settings::get('smtp_user');
            $mail->Password = (string) Settings::get('smtp_pass');
            $mail->SMTPKeepAlive = true;
            $mail->Timeout = 30;
        }
        return $mail;
    }

    public function close()
    {
        if ($this->mail && $this->mail->Mailer === 'smtp') {
            try {
                $this->mail->smtpClose();
            } catch (Exception $e) {
                // ignore
            }
        }
    }

    /** Checks we can connect + authenticate to the SMTP server. Returns null on success or an error string. */
    public function testConnection()
    {
        if ($this->mail->Mailer !== 'smtp') {
            return null;
        }
        try {
            if (!$this->mail->smtpConnect()) {
                return 'Could not connect to the SMTP server.';
            }
            $this->mail->smtpClose();
            return null;
        } catch (MailerException $e) {
            return $e->getMessage();
        }
    }

    /**
     * Personalises the campaign for one recipient.
     *
     * @param array $campaign campaign row
     * @param array $recipient ['id','email','name'] (id 0 = test email)
     * @param array $linkMap url => link id (for click tracking)
     * @return array [subject, html, text, unsubscribeUrl]
     */
    public static function render(array $campaign, array $recipient, array $linkMap = array(), $isTest = false)
    {
        $base = Settings::appUrl();
        $rid = (int) $recipient['id'];
        $token = Crypto::recipientToken($rid);
        $unsubscribeUrl = $base . '/u.php?r=' . $token;
        $vars = self::vars($recipient, $unsubscribeUrl);

        $html = (string) $campaign['html'];

        // 1. Click tracking (rewrite links before merge tags are filled in)
        if (!$isTest && !empty($campaign['track_clicks']) && $linkMap) {
            $html = preg_replace_callback('/(<a\b[^>]*?\bhref\s*=\s*)(["\'])(.*?)\2/is', function ($m) use ($linkMap, $base, $token) {
                $url = trim($m[3]);
                if (!isset($linkMap[$url])) {
                    return $m[0];
                }
                $tracked = $base . '/t.php?c=' . $token . '&amp;l=' . $linkMap[$url];
                return $m[1] . $m[2] . $tracked . $m[2];
            }, $html);
        }

        // 2. Merge tags
        $html = self::fillTags($html, $vars, true);
        $subject = self::fillTags((string) $campaign['subject'], $vars, false);

        // 3. Preheader (hidden preview text)
        $preheader = trim((string) (isset($campaign['preheader']) ? $campaign['preheader'] : ''));
        if ($preheader !== '') {
            $pre = '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
                . Util::h(self::fillTags($preheader, $vars, false)) . str_repeat('&#847;&zwnj;&nbsp;', 30) . '</div>';
            $html = self::insertAfterBodyOpen($html, $pre);
        }

        // 4. Compliance footer if the template has no unsubscribe link
        $hasUnsub = stripos((string) $campaign['html'], '{{unsubscribe_url') !== false || stripos((string) $campaign['html'], '{{ unsubscribe_url') !== false;
        if (!$hasUnsub && Settings::bool('auto_footer')) {
            $html = self::insertBeforeBodyClose($html, self::footerHtml($unsubscribeUrl));
        }

        // 5. Open tracking pixel
        if (!$isTest && !empty($campaign['track_opens'])) {
            $pixel = '<img src="' . $base . '/t.php?o=' . $token . '" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />';
            $html = self::insertBeforeBodyClose($html, $pixel);
        }

        // Plain-text alternative
        $textSource = trim((string) (isset($campaign['text_body']) ? $campaign['text_body'] : ''));
        if ($textSource !== '') {
            $text = self::fillTags($textSource, $vars, false);
        } else {
            $text = Util::htmlToText(self::fillTags((string) $campaign['html'], $vars, true));
        }
        if (!$hasUnsub) {
            $text .= "\n\n--\nUnsubscribe: " . $unsubscribeUrl;
            $addr = trim((string) Settings::get('company_address'));
            if ($addr !== '') {
                $text .= "\n" . $addr;
            }
        }

        if ($isTest) {
            $subject = '[TEST] ' . $subject;
        }
        return array($subject, $html, $text, $unsubscribeUrl);
    }

    public static function vars(array $recipient, $unsubscribeUrl)
    {
        $name = trim((string) (isset($recipient['name']) ? $recipient['name'] : ''));
        $parts = preg_split('/\s+/', $name);
        $first = $name !== '' ? $parts[0] : '';
        $last = $name !== '' && count($parts) > 1 ? end($parts) : '';
        $tz = Settings::timezone();
        $now = new DateTime('now', new DateTimeZone($tz));
        return array(
            'name' => $name,
            'first_name' => $first,
            'last_name' => $last,
            'email' => (string) $recipient['email'],
            'unsubscribe_url' => $unsubscribeUrl,
            'date' => $now->format('F j, Y'),
            'year' => $now->format('Y'),
            'company_address' => (string) Settings::get('company_address'),
        );
    }

    /** Replaces {{tag}} and {{tag|fallback}} placeholders. */
    public static function fillTags($content, array $vars, $escapeHtml)
    {
        return preg_replace_callback('/\{\{\s*([a-z_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/i', function ($m) use ($vars, $escapeHtml) {
            $key = strtolower($m[1]);
            if (!array_key_exists($key, $vars)) {
                return $m[0];
            }
            $value = (string) $vars[$key];
            if ($value === '' && isset($m[2])) {
                $value = $m[2];
            }
            if (!$escapeHtml) {
                return $value;
            }
            // Addresses and URLs inside attributes only need attribute-safe escaping.
            return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false);
        }, $content);
    }

    public static function footerHtml($unsubscribeUrl)
    {
        $addr = trim((string) Settings::get('company_address'));
        $html = '<div style="max-width:600px;margin:24px auto 0;padding:16px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8a8f98;">';
        if ($addr !== '') {
            $html .= Util::h($addr) . '<br>';
        }
        $html .= 'You received this email because you subscribed to our updates. '
            . '<a href="' . Util::h($unsubscribeUrl) . '" style="color:#8a8f98;text-decoration:underline;">Unsubscribe</a>';
        $html .= '</div>';
        return $html;
    }

    private static function insertBeforeBodyClose($html, $snippet)
    {
        $pos = strripos($html, '</body>');
        if ($pos === false) {
            return $html . $snippet;
        }
        return substr($html, 0, $pos) . $snippet . substr($html, $pos);
    }

    private static function insertAfterBodyOpen($html, $snippet)
    {
        if (preg_match('/<body\b[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE)) {
            $pos = $m[0][1] + strlen($m[0][0]);
            return substr($html, 0, $pos) . $snippet . substr($html, $pos);
        }
        return $snippet . $html;
    }

    /** Extracts the distinct trackable (http/https) link targets from campaign HTML. */
    public static function extractLinks($html)
    {
        $links = array();
        if (preg_match_all('/<a\b[^>]*?\bhref\s*=\s*(["\'])(.*?)\1/is', (string) $html, $m)) {
            foreach ($m[2] as $url) {
                $url = trim($url);
                if (!preg_match('#^https?://#i', $url)) {
                    continue;
                }
                if (stripos($url, '{{unsubscribe_url') !== false) {
                    continue;
                }
                $links[$url] = true;
            }
        }
        return array_keys($links);
    }

    /**
     * Sends one message. Returns null on success, or [classification, message].
     */
    public function send(array $campaign, array $recipient, $subject, $html, $text, $unsubscribeUrl)
    {
        $mail = $this->mail;
        $fromEmail = $campaign['from_email'] !== '' ? $campaign['from_email'] : Settings::get('from_email');
        $fromName = $campaign['from_name'] !== '' ? $campaign['from_name'] : Settings::get('from_name');
        $replyTo = $campaign['reply_to'] !== '' ? $campaign['reply_to'] : Settings::get('reply_to');
        $rid = (int) $recipient['id'];
        $token = Crypto::recipientToken($rid);

        try {
            $mail->clearAllRecipients();
            $mail->clearReplyTos();
            $mail->clearCustomHeaders();
            $mail->clearAttachments();
            $mail->setFrom($fromEmail, $fromName, false);
            $mail->Sender = $fromEmail;
            if ($replyTo) {
                $mail->addReplyTo($replyTo);
            }
            if (!$mail->addAddress($recipient['email'], (string) $recipient['name'])) {
                return array(self::ERR_INVALID, 'Invalid email address');
            }
            $domain = Util::emailDomain($fromEmail) ?: 'localhost';
            $mail->MessageID = '<emt-' . str_replace('.', '-', $token) . '-' . substr(Util::randomHex(4), 0, 8) . '@' . $domain . '>';
            $mail->addCustomHeader('X-EMT-ID', $token);
            $mail->addCustomHeader('List-Unsubscribe', '<' . $unsubscribeUrl . '>, <mailto:' . $fromEmail . '?subject=unsubscribe>');
            $mail->addCustomHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
            if (!empty($campaign['id'])) {
                $mail->addCustomHeader('X-Campaign-ID', 'c' . (int) $campaign['id']);
            }
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body = $html;
            $mail->AltBody = $text;
            $mail->send();
            return null;
        } catch (MailerException $e) {
            return $this->classify($e->getMessage());
        } catch (Exception $e) {
            return array(self::ERR_GLOBAL, $e->getMessage());
        }
    }

    /** Figures out whether an SMTP failure is about the recipient or about our connection/account. */
    private function classify($message)
    {
        $smtp = $this->mail->Mailer === 'smtp' ? $this->mail->getSMTPInstance() : null;
        $err = $smtp ? $smtp->getError() : array();
        $code = isset($err['smtp_code']) ? (int) $err['smtp_code'] : 0;
        $ext = isset($err['smtp_code_ex']) ? (string) $err['smtp_code_ex'] : '';
        $detail = trim((isset($err['detail']) ? (string) $err['detail'] : ''));
        $full = trim(($code ? $code . ' ' : '') . ($ext ? $ext . ' ' : '') . ($detail !== '' ? $detail : $message));

        if (stripos($message, 'Invalid address') === 0) {
            return array(self::ERR_INVALID, $message);
        }
        $isRcpt = stripos($message, 'following recipients failed') !== false;
        $isData = stripos($message, 'data not accepted') !== false;

        if ($isRcpt) {
            // The error text is included in the exception message for recipient failures.
            $text = $message;
            if (!$code && preg_match('/\b([45]\d\d)\b/', $text, $cm)) {
                $code = (int) $cm[1];
            }
            if (!$ext && preg_match('/\b([45]\.\d{1,3}\.\d{1,3})\b/', $text, $em)) {
                $ext = $em[1];
            }
            $full = trim(($code ? $code . ' ' : '') . preg_replace('/^.*recipients failed:\s*/i', '', $text));
            if ($code >= 400 && $code < 500) {
                if (self::looksLikeRateLimit($text)) {
                    return array(self::ERR_GLOBAL, $full);
                }
                return array(self::ERR_TEMP, $full);
            }
            if (strpos($ext, '5.1.') === 0 || preg_match('/user unknown|unknown user|no such user|does not exist|mailbox unavailable|not found|invalid recipient|recipient rejected|address rejected|mailbox not found/i', $text)) {
                if (self::looksLikeRateLimit($text) || preg_match('/relay|authenticat|sender/i', $text)) {
                    return array(self::ERR_GLOBAL, $full);
                }
                return array(self::ERR_HARD, $full);
            }
            if (preg_match('/relay|authenticat|not permitted|sender/i', $text) || self::looksLikeRateLimit($text)) {
                return array(self::ERR_GLOBAL, $full);
            }
            return array(self::ERR_FAILED, $full);
        }
        if ($isData) {
            if (($code >= 400 && $code < 500) || self::looksLikeRateLimit($full)) {
                return array(self::looksLikeRateLimit($full) ? self::ERR_GLOBAL : self::ERR_TEMP, $full);
            }
            return array(self::ERR_FAILED, $full);
        }
        // Connection, authentication, MAIL FROM, TLS... problems are not the recipient's fault.
        return array(self::ERR_GLOBAL, $full !== '' ? $full : $message);
    }

    private static function looksLikeRateLimit($text)
    {
        return (bool) preg_match('/rate.?limit|too many (messages|emails|mails|connections|recipients|requests)|sending (limit|quota)|limit exceeded|message limit|throttl/i', (string) $text)
            && !preg_match('/mailbox (is )?full|over quota|mailbox size/i', (string) $text);
    }

    /** Sends a test version of a campaign to the given address. */
    public static function sendTest(array $campaign, $to)
    {
        $mailer = new self();
        $recipient = array('id' => 0, 'email' => $to, 'name' => 'Test Recipient');
        list($subject, $html, $text, $unsub) = self::render($campaign, $recipient, array(), true);
        $res = $mailer->send($campaign, $recipient, $subject, $html, $text, $unsub);
        $mailer->close();
        DB::insert('emt_send_log', array('sent_at' => Util::now()));
        return $res;
    }
}
