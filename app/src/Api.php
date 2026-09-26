<?php
defined('EMT') or exit;

/**
 * JSON API used by the single-page admin app (assets/app.js).
 * Every request: POST api.php?a=<action> with a JSON body and the X-CSRF-Token header.
 * CSV downloads use GET api.php?a=<action>&csrf=<token>&...
 */
class Api
{
    private $in = array();

    private static $public = array('auth.state', 'auth.login');
    private static $downloads = array('house.export', 'campaign.export', 'suppression.export');

    public static function handle()
    {
        $api = new self();
        try {
            if (!emt_installed()) {
                Util::jsonResponse(array('ok' => false, 'error' => 'MailPilot is not installed yet. Open install.php first.', 'code' => 'not_installed'));
            }
            Auth::startSession();
            $action = isset($_GET['a']) ? (string) $_GET['a'] : '';
            $isGet = $_SERVER['REQUEST_METHOD'] === 'GET';
            if ($isGet) {
                if (!in_array($action, self::$downloads, true)) {
                    Util::jsonResponse(array('ok' => false, 'error' => 'Method not allowed'), 405);
                }
                $api->in = $_GET;
                $token = isset($_GET['csrf']) ? $_GET['csrf'] : '';
            } else {
                $ctype = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
                if (stripos($ctype, 'application/json') !== false) {
                    $json = json_decode((string) file_get_contents('php://input'), true);
                    $api->in = is_array($json) ? $json : array();
                } else {
                    $api->in = $_POST;
                }
                $token = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
            }
            if ($action !== 'auth.state' && !Auth::checkCsrf($token)) {
                Util::jsonResponse(array('ok' => false, 'error' => 'Your session expired. Please reload the page.', 'code' => 'csrf'), 419);
            }
            if (!in_array($action, self::$public, true) && !Auth::user()) {
                Util::jsonResponse(array('ok' => false, 'error' => 'Please sign in.', 'code' => 'auth'), 401);
            }
            $method = 'a' . str_replace(' ', '', ucwords(str_replace(array('.', '_'), ' ', $action)));
            if ($action === '' || !method_exists($api, $method)) {
                Util::jsonResponse(array('ok' => false, 'error' => 'Unknown action: ' . $action), 404);
            }
            session_write_close_if_readonly($action);
            $result = $api->$method();
            Util::jsonResponse(array_merge(array('ok' => true), is_array($result) ? $result : array()));
        } catch (InvalidArgumentException $e) {
            Util::jsonResponse(array('ok' => false, 'error' => $e->getMessage()));
        } catch (Throwable $e) {
            error_log('[MailPilot API] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            Util::jsonResponse(array('ok' => false, 'error' => 'Server error: ' . $e->getMessage()), 500);
        }
    }

    /* ------------------------------------------------------------------ helpers */

    private function str($key, $max = 255, $default = '')
    {
        $v = isset($this->in[$key]) ? $this->in[$key] : $default;
        if (is_array($v)) {
            return $default;
        }
        $v = trim((string) $v);
        return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
    }

    private function raw($key, $default = '')
    {
        return isset($this->in[$key]) && !is_array($this->in[$key]) ? (string) $this->in[$key] : $default;
    }

    private function int($key, $default = 0)
    {
        return isset($this->in[$key]) && is_numeric($this->in[$key]) ? (int) $this->in[$key] : $default;
    }

    private function bool($key)
    {
        $v = isset($this->in[$key]) ? $this->in[$key] : false;
        return $v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'on';
    }

    private function ids($key)
    {
        $v = isset($this->in[$key]) ? $this->in[$key] : array();
        if (!is_array($v)) {
            $v = explode(',', (string) $v);
        }
        return array_values(array_unique(array_filter(array_map('intval', $v))));
    }

    private function page()
    {
        return max(1, $this->int('page', 1));
    }

    private function per($default = 50)
    {
        return min(200, max(10, $this->int('per', $default)));
    }

    private static function fail($msg)
    {
        throw new InvalidArgumentException($msg);
    }

    private static function paged($total, $page, $per)
    {
        return array('total' => (int) $total, 'page' => $page, 'per' => $per, 'pages' => max(1, (int) ceil($total / $per)));
    }

    private static function userOut($u)
    {
        return $u ? array('id' => (int) $u['id'], 'username' => $u['username'], 'must_change' => (bool) $u['must_change']) : null;
    }

    private static function houseOut($row)
    {
        return array(
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'color' => $row['color'],
            'created_at' => Util::iso($row['created_at']),
            'updated_at' => Util::iso($row['updated_at']),
            'total' => (int) $row['total'],
            'active' => (int) $row['active'],
            'unsubscribed' => (int) $row['unsubscribed'],
            'bounced' => (int) $row['bounced'],
            'invalid' => (int) $row['invalid'],
            'complained' => (int) $row['complained'],
        );
    }

    private static function houseQuery($where = '', array $params = array())
    {
        return DB::all(
            "SELECT l.*, COUNT(c.id) total,
                    COALESCE(SUM(c.status = 'active'),0) active, COALESCE(SUM(c.status = 'unsubscribed'),0) unsubscribed,
                    COALESCE(SUM(c.status = 'bounced'),0) bounced, COALESCE(SUM(c.status = 'invalid'),0) invalid,
                    COALESCE(SUM(c.status = 'complained'),0) complained
             FROM emt_lists l LEFT JOIN emt_contacts c ON c.list_id = l.id
             $where GROUP BY l.id ORDER BY l.created_at DESC, l.id DESC",
            $params
        );
    }

    private function requireHouse($key = 'list_id')
    {
        $id = $this->int($key);
        $rows = self::houseQuery('WHERE l.id = ?', array($id));
        if (!$rows) {
            self::fail('Email House not found.');
        }
        return self::houseOut($rows[0]);
    }

    private function requireCampaign($key = 'id')
    {
        $c = Campaigns::find($this->int($key));
        if (!$c) {
            self::fail('Campaign not found.');
        }
        return $c;
    }

    private static function campaignOut(array $c, $withHtml = false)
    {
        $out = array(
            'id' => (int) $c['id'],
            'name' => $c['name'],
            'subject' => $c['subject'],
            'preheader' => $c['preheader'],
            'from_name' => $c['from_name'],
            'from_email' => $c['from_email'],
            'reply_to' => $c['reply_to'],
            'track_opens' => (bool) $c['track_opens'],
            'track_clicks' => (bool) $c['track_clicks'],
            'status' => $c['status'],
            'scheduled_at' => Util::iso($c['scheduled_at']),
            'started_at' => Util::iso($c['started_at']),
            'completed_at' => Util::iso($c['completed_at']),
            'created_at' => Util::iso($c['created_at']),
            'updated_at' => Util::iso($c['updated_at']),
            'total' => (int) $c['total'],
            'last_error' => $c['last_error'],
            'list_ids' => Campaigns::listIds($c['id']),
        );
        if ($withHtml) {
            $out['html'] = (string) $c['html'];
            $out['text_body'] = (string) $c['text_body'];
        }
        return $out;
    }

    /* ------------------------------------------------------------------ auth */

    public function aAuthState()
    {
        return array(
            'user' => self::userOut(Auth::user()),
            'csrf' => Auth::csrfToken(),
            'version' => EMT_VERSION,
        );
    }

    public function aAuthLogin()
    {
        $res = Auth::attempt($this->str('username', 64), $this->raw('password'));
        if (is_string($res)) {
            self::fail($res);
        }
        return array('user' => self::userOut($res), 'csrf' => Auth::csrfToken());
    }

    public function aAuthLogout()
    {
        Auth::logout();
        return array();
    }

    public function aAccountUpdate()
    {
        $user = Auth::user();
        $row = DB::one('SELECT * FROM emt_users WHERE id = ?', array($user['id']));
        if (!password_verify($this->raw('current_password'), $row['password_hash'])) {
            self::fail('Your current password is not correct.');
        }
        $username = $this->str('username', 64);
        if ($username === '' || !preg_match('/^[A-Za-z0-9_.@-]{3,64}$/', $username)) {
            self::fail('Username must be 3-64 characters (letters, numbers, . _ - @).');
        }
        $data = array('username' => $username);
        $new = $this->raw('new_password');
        if ($new !== '') {
            if (strlen($new) < 8) {
                self::fail('The new password must be at least 8 characters long.');
            }
            if ($new !== $this->raw('confirm_password')) {
                self::fail('The new passwords do not match.');
            }
            $data['password_hash'] = password_hash($new, PASSWORD_DEFAULT);
            $data['must_change'] = 0;
        }
        if (DB::val('SELECT COUNT(*) FROM emt_users WHERE username = ? AND id <> ?', array($username, $user['id']))) {
            self::fail('That username is already taken.');
        }
        DB::update('emt_users', $data, 'id = ?', array($user['id']));
        return array('user' => self::userOut(Auth::user()));
    }

    /* ------------------------------------------------------------------ app / dashboard */

    public function aAppBoot()
    {
        return array(
            'user' => self::userOut(Auth::user()),
            'engine' => Engine::status(),
            'app_url' => Settings::appUrl(),
            'from_email' => Settings::get('from_email'),
            'from_name' => Settings::get('from_name'),
            'version' => EMT_VERSION,
        );
    }

    public function aEngineStatus()
    {
        return array('engine' => Engine::status());
    }

    public function aEngineRun()
    {
        Util::longRunning(60);
        $summary = Engine::run('web', 20);
        return array('summary' => $summary, 'engine' => Engine::status());
    }

    public function aDashboard()
    {
        $tzOffset = $this->int('tz_offset'); // minutes east of UTC, from the browser
        $since30 = Util::now(-30 * 86400);
        $contacts = DB::one("SELECT COUNT(DISTINCT email) total, COUNT(DISTINCT CASE WHEN status = 'active' THEN email END) active FROM emt_contacts");
        $agg = DB::one(
            "SELECT COUNT(*) sent, SUM(opened_at IS NOT NULL) opened, SUM(clicked_at IS NOT NULL) clicked,
                    SUM(status = 'bounced') bounced, SUM(unsubscribed_at IS NOT NULL) unsubscribed
             FROM emt_recipients WHERE sent_at >= ?",
            array($since30)
        );
        $sent = (int) $agg['sent'];
        $daily = array();
        $rows = DB::all(
            'SELECT DATE(DATE_ADD(sent_at, INTERVAL ? MINUTE)) d, COUNT(*) n, SUM(opened_at IS NOT NULL) o
             FROM emt_recipients WHERE sent_at >= ? GROUP BY d ORDER BY d',
            array($tzOffset, Util::now(-15 * 86400))
        );
        $byDay = array();
        foreach ($rows as $r) {
            $byDay[$r['d']] = array((int) $r['n'], (int) $r['o']);
        }
        for ($i = 13; $i >= 0; $i--) {
            $d = gmdate('Y-m-d', time() + $tzOffset * 60 - $i * 86400);
            $daily[] = array('date' => $d, 'sent' => isset($byDay[$d]) ? $byDay[$d][0] : 0, 'opened' => isset($byDay[$d]) ? $byDay[$d][1] : 0);
        }
        $recent = array();
        foreach (DB::all('SELECT * FROM emt_campaigns ORDER BY COALESCE(started_at, updated_at) DESC, id DESC LIMIT 6') as $c) {
            $o = self::campaignOut($c);
            $o['stats'] = Campaigns::stats($c['id']);
            $recent[] = $o;
        }
        $engine = Engine::status();
        return array(
            'kpis' => array(
                'contacts' => (int) $contacts['total'],
                'contacts_active' => (int) $contacts['active'],
                'houses' => (int) DB::val('SELECT COUNT(*) FROM emt_lists'),
                'campaigns' => (int) DB::val('SELECT COUNT(*) FROM emt_campaigns'),
                'sent_30d' => $sent,
                'open_rate' => $sent ? round($agg['opened'] / $sent * 100, 1) : 0,
                'click_rate' => $sent ? round($agg['clicked'] / $sent * 100, 1) : 0,
                'bounce_rate' => $sent ? round($agg['bounced'] / $sent * 100, 1) : 0,
                'unsubscribed_30d' => (int) $agg['unsubscribed'],
                'suppressed' => (int) DB::val('SELECT COUNT(*) FROM emt_suppressions'),
            ),
            'daily' => $daily,
            'recent' => $recent,
            'engine' => $engine,
            'checklist' => array(
                'smtp' => Settings::smtpConfigured(),
                'test_sent' => Settings::get('last_test_email_at') !== '',
                'cron' => $engine['cron_last_run'] !== null,
                'bounces' => Settings::bool('pop_enabled'),
                'house' => (int) DB::val('SELECT COUNT(*) FROM emt_contacts') > 0,
                'campaign' => (int) DB::val("SELECT COUNT(*) FROM emt_campaigns WHERE status <> 'draft'") > 0,
                'address' => trim((string) Settings::get('company_address')) !== '',
            ),
        );
    }

    /* ------------------------------------------------------------------ houses & contacts */

    public function aHousesList()
    {
        $out = array();
        foreach (self::houseQuery() as $row) {
            $out[] = self::houseOut($row);
        }
        return array('houses' => $out);
    }

    public function aHousesSave()
    {
        $name = $this->str('name', 150);
        if ($name === '') {
            self::fail('Give the Email House a name.');
        }
        $colors = array('violet', 'blue', 'teal', 'green', 'amber', 'rose', 'pink', 'slate');
        $color = in_array($this->str('color', 20), $colors, true) ? $this->str('color', 20) : 'violet';
        $data = array('name' => $name, 'description' => $this->str('description', 255), 'color' => $color, 'updated_at' => Util::now());
        $id = $this->int('id');
        if ($id) {
            if (!DB::val('SELECT id FROM emt_lists WHERE id = ?', array($id))) {
                self::fail('Email House not found.');
            }
            DB::update('emt_lists', $data, 'id = ?', array($id));
        } else {
            $data['created_at'] = Util::now();
            $id = DB::insert('emt_lists', $data);
        }
        $this->in['list_id'] = $id;
        return array('house' => $this->requireHouse());
    }

    public function aHousesDelete()
    {
        $id = $this->int('id');
        $used = DB::val(
            "SELECT c.name FROM emt_campaign_lists cl JOIN emt_campaigns c ON c.id = cl.campaign_id
             WHERE cl.list_id = ? AND c.status IN ('sending','scheduled','paused') LIMIT 1",
            array($id)
        );
        if ($used) {
            self::fail('This house is used by the active campaign "' . $used . '". Finish or cancel it first.');
        }
        DB::exec('DELETE FROM emt_campaign_lists WHERE list_id = ? AND campaign_id IN (SELECT id FROM emt_campaigns WHERE status = \'draft\')', array($id));
        DB::exec('DELETE FROM emt_lists WHERE id = ?', array($id));
        return array();
    }

    public function aHouseGet()
    {
        return array('house' => $this->requireHouse('id'));
    }

    public function aContactsList()
    {
        $house = $this->requireHouse();
        $page = $this->page();
        $per = $this->per(50);
        $where = array('c.list_id = ?');
        $params = array($house['id']);
        $status = $this->str('status', 20);
        if (in_array($status, array('active', 'unsubscribed', 'bounced', 'invalid', 'complained'), true)) {
            $where[] = 'c.status = ?';
            $params[] = $status;
        }
        $q = $this->str('q', 100);
        if ($q !== '') {
            $where[] = '(c.email LIKE ? OR c.name LIKE ?)';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $w = implode(' AND ', $where);
        $total = (int) DB::val("SELECT COUNT(*) FROM emt_contacts c WHERE $w", $params);
        $rows = DB::all(
            "SELECT c.id, c.email, c.name, c.status, c.created_at, s.detail suppress_detail, s.reason suppress_reason
             FROM emt_contacts c LEFT JOIN emt_suppressions s ON s.email = c.email
             WHERE $w ORDER BY c.id DESC LIMIT " . (int) $per . ' OFFSET ' . (int) (($page - 1) * $per),
            $params
        );
        foreach ($rows as &$r) {
            $r['id'] = (int) $r['id'];
            $r['created_at'] = Util::iso($r['created_at']);
        }
        unset($r);
        return array_merge(array('rows' => $rows, 'house' => $house), self::paged($total, $page, $per));
    }

    public function aContactsAdd()
    {
        $house = $this->requireHouse();
        $email = Util::normalizeEmail($this->str('email', 191));
        if (!Util::isValidEmail($email)) {
            self::fail('"' . $email . '" is not a valid email address.');
        }
        if (DB::val('SELECT id FROM emt_contacts WHERE list_id = ? AND email = ?', array($house['id'], $email))) {
            self::fail('This email is already in the house.');
        }
        DB::insert('emt_contacts', array(
            'list_id' => $house['id'],
            'email' => $email,
            'name' => $this->str('name', 190),
            'status' => 'active',
            'created_at' => Util::now(),
        ));
        $suppressed = Suppression::applyToList($house['id']) > 0;
        return array('suppressed' => $suppressed, 'house' => $this->requireHouse());
    }

    public function aContactsImport()
    {
        Util::longRunning(600);
        $house = $this->requireHouse();
        $importer = new Importer($house['id']);
        if (!empty($_FILES['file']) && is_array($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
            $f = $_FILES['file'];
            if ($f['error'] !== UPLOAD_ERR_OK) {
                $limits = array(UPLOAD_ERR_INI_SIZE => 'The file is larger than the server upload limit (' . ini_get('upload_max_filesize') . ').');
                self::fail(isset($limits[$f['error']]) ? $limits[$f['error']] : 'Upload failed (error ' . $f['error'] . ').');
            }
            $stats = $importer->importCsv($f['tmp_name']);
        } else {
            $text = $this->raw('text');
            if (trim($text) === '') {
                self::fail('Paste at least one email address.');
            }
            $stats = $importer->importText($text);
        }
        return array('stats' => $stats, 'house' => $this->requireHouse());
    }

    public function aContactsUpdate()
    {
        $id = $this->int('id');
        $row = DB::one('SELECT * FROM emt_contacts WHERE id = ?', array($id));
        if (!$row) {
            self::fail('Contact not found.');
        }
        DB::update('emt_contacts', array('name' => $this->str('name', 190), 'updated_at' => Util::now()), 'id = ?', array($id));
        return array();
    }

    public function aContactsDelete()
    {
        $house = $this->requireHouse();
        $ids = $this->ids('ids');
        if (!$ids) {
            self::fail('Nothing selected.');
        }
        $n = DB::exec('DELETE FROM emt_contacts WHERE list_id = ? AND id IN (' . DB::in($ids) . ')', array_merge(array($house['id']), $ids));
        return array('deleted' => $n, 'house' => $this->requireHouse());
    }

    /** Manually unsubscribe (suppress) or re-activate contacts. */
    public function aContactsSetStatus()
    {
        $house = $this->requireHouse();
        $ids = $this->ids('ids');
        $status = $this->str('status', 20);
        if (!$ids || !in_array($status, array('active', 'unsubscribed'), true)) {
            self::fail('Nothing to update.');
        }
        $emails = DB::col('SELECT email FROM emt_contacts WHERE list_id = ? AND id IN (' . DB::in($ids) . ')', array_merge(array($house['id']), $ids));
        foreach ($emails as $e) {
            if ($status === 'active') {
                Suppression::remove($e);
            } else {
                Suppression::add($e, 'manual', 'Unsubscribed manually by admin');
            }
        }
        return array('updated' => count($emails), 'house' => $this->requireHouse());
    }

    public function aHouseClean()
    {
        $house = $this->requireHouse();
        $n = DB::exec("DELETE FROM emt_contacts WHERE list_id = ? AND status <> 'active'", array($house['id']));
        return array('deleted' => $n, 'house' => $this->requireHouse());
    }

    /** Checks the domains of a house's contacts in small chunks (called repeatedly by the UI). */
    public function aHouseVerify()
    {
        Util::longRunning(120);
        $house = $this->requireHouse();
        if (!DomainCheck::available()) {
            self::fail('DNS lookups are not available on this server.');
        }
        $staleValid = Util::now(-30 * 86400);
        $staleInvalid = Util::now(-3 * 86400);
        $pendingSql = "FROM (SELECT DISTINCT SUBSTRING_INDEX(c.email, '@', -1) d FROM emt_contacts c WHERE c.list_id = ? AND c.status = 'active') x
                       LEFT JOIN emt_domains dm ON dm.domain = x.d
                       WHERE dm.domain IS NULL OR (dm.valid = 1 AND dm.checked_at < ?) OR (dm.valid = 0 AND dm.checked_at < ?)";
        $params = array($house['id'], $staleValid, $staleInvalid);
        $domains = DB::col("SELECT x.d $pendingSql LIMIT 15", $params);
        $invalid = array();
        $started = microtime(true);
        $checked = 0;
        foreach ($domains as $d) {
            $res = DomainCheck::check($d, false);
            $checked++;
            if ($res === DomainCheck::INVALID) {
                $invalid[] = $d;
            } elseif ($res === DomainCheck::UNKNOWN) {
                // Resolver trouble: remember as valid for now so we don't loop forever.
                DB::q('INSERT INTO emt_domains (domain, valid, checked_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE valid = 1, checked_at = VALUES(checked_at)', array($d, Util::now()));
            }
            if (microtime(true) - $started > 20) {
                break;
            }
        }
        // Mark contacts on dead domains as invalid (and suppress them globally).
        $marked = 0;
        $rows = DB::all(
            "SELECT c.email FROM emt_contacts c JOIN emt_domains dm ON dm.domain = SUBSTRING_INDEX(c.email, '@', -1)
             WHERE c.list_id = ? AND c.status = 'active' AND dm.valid = 0",
            array($house['id'])
        );
        foreach ($rows as $r) {
            Suppression::add($r['email'], 'invalid', 'Domain "' . Util::emailDomain($r['email']) . '" does not exist or cannot receive email');
            $marked++;
        }
        $remaining = (int) DB::val("SELECT COUNT(*) $pendingSql", $params);
        $totalDomains = (int) DB::val("SELECT COUNT(DISTINCT SUBSTRING_INDEX(email, '@', -1)) FROM emt_contacts WHERE list_id = ? AND status = 'active'", array($house['id']));
        return array(
            'checked' => $checked,
            'invalid_domains' => $invalid,
            'marked' => $marked,
            'remaining' => $remaining,
            'total_domains' => $totalDomains,
            'house' => $this->requireHouse(),
        );
    }

    public function aHouseExport()
    {
        $house = $this->requireHouse();
        $status = $this->str('status', 20);
        $params = array($house['id']);
        $sql = 'SELECT email, name, status, created_at FROM emt_contacts WHERE list_id = ?';
        if (in_array($status, array('active', 'unsubscribed', 'bounced', 'invalid', 'complained'), true)) {
            $sql .= ' AND status = ?';
            $params[] = $status;
        }
        $stmt = DB::q($sql . ' ORDER BY id', $params);
        $gen = function () use ($stmt) {
            while ($r = $stmt->fetch()) {
                yield $r;
            }
        };
        Util::csvDownload('house-' . $house['name'] . '.csv', array('email', 'name', 'status', 'added_at_utc'), $gen());
    }

    /* ------------------------------------------------------------------ campaigns */

    public function aCampaignsList()
    {
        $rows = DB::all('SELECT * FROM emt_campaigns ORDER BY FIELD(status, \'sending\', \'scheduled\', \'paused\', \'draft\', \'completed\', \'cancelled\'), COALESCE(started_at, updated_at) DESC, id DESC LIMIT 300');
        $out = array();
        foreach ($rows as $c) {
            $o = self::campaignOut($c);
            $o['stats'] = $c['status'] === 'draft' ? null : Campaigns::stats($c['id']);
            $out[] = $o;
        }
        return array('campaigns' => $out);
    }

    public function aCampaignGet()
    {
        $c = $this->requireCampaign();
        $out = self::campaignOut($c, true);
        return array(
            'campaign' => $out,
            'audience' => Campaigns::audienceCount($out['list_ids']),
            'problems' => Campaigns::launchProblems($c),
        );
    }

    public function aCampaignAudience()
    {
        return array('audience' => Campaigns::audienceCount($this->ids('list_ids')));
    }

    public function aCampaignSave()
    {
        $id = $this->int('id');
        if ($id) {
            $c = $this->requireCampaign();
            if ($c['status'] !== 'draft') {
                self::fail('This campaign has already been launched and can no longer be edited. Duplicate it to make changes.');
            }
        }
        $fromEmail = Util::normalizeEmail($this->str('from_email', 191));
        if ($fromEmail !== '' && !Util::isValidEmail($fromEmail)) {
            self::fail('The From email address is not valid.');
        }
        $replyTo = Util::normalizeEmail($this->str('reply_to', 191));
        if ($replyTo !== '' && !Util::isValidEmail($replyTo)) {
            self::fail('The Reply-To address is not valid.');
        }
        $name = $this->str('name', 190);
        $data = array(
            'name' => $name !== '' ? $name : 'Untitled campaign',
            'subject' => $this->str('subject', 255),
            'preheader' => $this->str('preheader', 255),
            'from_name' => $this->str('from_name', 150),
            'from_email' => $fromEmail,
            'reply_to' => $replyTo,
            'html' => $this->raw('html'),
            'text_body' => $this->raw('text_body'),
            'track_opens' => $this->bool('track_opens') ? 1 : 0,
            'track_clicks' => $this->bool('track_clicks') ? 1 : 0,
            'updated_at' => Util::now(),
        );
        $listIds = $this->ids('list_ids');
        if ($listIds) {
            $listIds = array_map('intval', DB::col('SELECT id FROM emt_lists WHERE id IN (' . DB::in($listIds) . ')', $listIds));
        }
        $id = DB::tx(function () use ($id, $data, $listIds) {
            if ($id) {
                DB::update('emt_campaigns', $data, 'id = ?', array($id));
            } else {
                $data['status'] = 'draft';
                $data['created_at'] = Util::now();
                $id = DB::insert('emt_campaigns', $data);
            }
            DB::exec('DELETE FROM emt_campaign_lists WHERE campaign_id = ?', array($id));
            foreach ($listIds as $lid) {
                DB::insert('emt_campaign_lists', array('campaign_id' => $id, 'list_id' => $lid));
            }
            return $id;
        });
        $this->in['id'] = $id;
        return $this->aCampaignGet();
    }

    /** Sends a test of the (possibly unsaved) campaign content. */
    public function aCampaignTest()
    {
        $to = Util::normalizeEmail($this->str('to', 191));
        if (!Util::isValidEmail($to)) {
            self::fail('Enter a valid email address to send the test to.');
        }
        if (!Settings::smtpConfigured()) {
            self::fail('Configure your SMTP settings first (Settings → Sending).');
        }
        $campaign = array(
            'id' => $this->int('id'),
            'subject' => $this->str('subject', 255) ?: 'Test email',
            'preheader' => $this->str('preheader', 255),
            'from_name' => $this->str('from_name', 150),
            'from_email' => Util::normalizeEmail($this->str('from_email', 191)),
            'reply_to' => Util::normalizeEmail($this->str('reply_to', 191)),
            'html' => $this->raw('html'),
            'text_body' => $this->raw('text_body'),
            'track_opens' => 0,
            'track_clicks' => 0,
        );
        if (trim($campaign['html']) === '') {
            self::fail('The email has no content yet.');
        }
        $err = Mailer::sendTest($campaign, $to);
        if ($err) {
            self::fail('The test email could not be sent: ' . $err[1]);
        }
        Settings::set('last_test_email_at', Util::now());
        return array('message' => 'Test email sent to ' . $to);
    }

    public function aCampaignLaunch()
    {
        $c = $this->requireCampaign();
        $schedule = $this->str('schedule_at', 40);
        $utc = null;
        if ($schedule !== '') {
            $ts = strtotime($schedule);
            if ($ts === false) {
                self::fail('The schedule date is not valid.');
            }
            if ($ts < time() - 60) {
                self::fail('The scheduled time is in the past.');
            }
            $utc = gmdate('Y-m-d H:i:s', $ts);
        }
        $queued = Campaigns::launch($c['id'], $utc);
        $c = Campaigns::find($c['id']);
        return array('queued' => $queued, 'campaign' => self::campaignOut($c));
    }

    public function aCampaignPause()
    {
        $c = $this->requireCampaign();
        if (!Campaigns::pause($c['id'])) {
            self::fail('Only sending or scheduled campaigns can be paused.');
        }
        return array('campaign' => self::campaignOut(Campaigns::find($c['id'])));
    }

    public function aCampaignResume()
    {
        $c = $this->requireCampaign();
        if (!Campaigns::resume($c['id'])) {
            self::fail('Only paused campaigns can be resumed.');
        }
        return array('campaign' => self::campaignOut(Campaigns::find($c['id'])));
    }

    public function aCampaignCancel()
    {
        $c = $this->requireCampaign();
        if (!Campaigns::cancel($c['id'])) {
            self::fail('This campaign cannot be cancelled.');
        }
        return array('campaign' => self::campaignOut(Campaigns::find($c['id'])));
    }

    public function aCampaignDuplicate()
    {
        $c = $this->requireCampaign();
        return array('id' => Campaigns::duplicate($c['id']));
    }

    public function aCampaignDelete()
    {
        $c = $this->requireCampaign();
        DB::exec('DELETE FROM emt_link_clicks WHERE link_id IN (SELECT id FROM emt_links WHERE campaign_id = ?)', array($c['id']));
        DB::exec('DELETE FROM emt_campaigns WHERE id = ?', array($c['id']));
        return array();
    }

    public function aCampaignReport()
    {
        $c = $this->requireCampaign();
        $id = (int) $c['id'];
        $links = DB::all('SELECT id, url, clicks, unique_clicks FROM emt_links WHERE campaign_id = ? ORDER BY unique_clicks DESC, clicks DESC, id LIMIT 50', array($id));
        foreach ($links as &$l) {
            $l['url'] = html_entity_decode($l['url'], ENT_QUOTES, 'UTF-8');
            $l['clicks'] = (int) $l['clicks'];
            $l['unique_clicks'] = (int) $l['unique_clicks'];
        }
        unset($l);
        $activity = DB::all(
            "(SELECT email, 'opened' ev, opened_at t FROM emt_recipients WHERE campaign_id = ? AND opened_at IS NOT NULL ORDER BY opened_at DESC LIMIT 8)
             UNION ALL (SELECT email, 'clicked' ev, clicked_at t FROM emt_recipients WHERE campaign_id = ? AND clicked_at IS NOT NULL ORDER BY clicked_at DESC LIMIT 8)
             UNION ALL (SELECT email, CONCAT(bounce_type, '_bounce') ev, bounced_at t FROM emt_recipients WHERE campaign_id = ? AND bounced_at IS NOT NULL ORDER BY bounced_at DESC LIMIT 8)
             UNION ALL (SELECT email, 'unsubscribed' ev, unsubscribed_at t FROM emt_recipients WHERE campaign_id = ? AND unsubscribed_at IS NOT NULL ORDER BY unsubscribed_at DESC LIMIT 8)
             UNION ALL (SELECT email, 'sent' ev, sent_at t FROM emt_recipients WHERE campaign_id = ? AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 8)
             ORDER BY t DESC LIMIT 12",
            array($id, $id, $id, $id, $id)
        );
        foreach ($activity as &$a) {
            $a['t'] = Util::iso($a['t']);
        }
        unset($a);
        $lists = DB::all('SELECT l.id, l.name, l.color FROM emt_campaign_lists cl JOIN emt_lists l ON l.id = cl.list_id WHERE cl.campaign_id = ?', array($id));
        return array(
            'campaign' => self::campaignOut($c),
            'stats' => Campaigns::stats($id),
            'links' => $links,
            'activity' => $activity,
            'lists' => $lists,
            'engine' => Engine::status(),
        );
    }

    public function aCampaignHtml()
    {
        $c = $this->requireCampaign();
        return array('html' => (string) $c['html'], 'subject' => $c['subject']);
    }

    private function recipientFilter(&$params)
    {
        $where = array('campaign_id = ?');
        $filter = $this->str('filter', 20);
        $map = array(
            'pending' => "status = 'pending'",
            'sent' => "status = 'sent'",
            'failed' => "status = 'failed'",
            'invalid' => "status = 'invalid'",
            'bounced' => "status = 'bounced'",
            'hard' => "bounce_type = 'hard'",
            'soft' => "bounce_type = 'soft'",
            'skipped' => "status = 'skipped'",
            'opened' => 'opened_at IS NOT NULL',
            'clicked' => 'clicked_at IS NOT NULL',
            'unsubscribed' => 'unsubscribed_at IS NOT NULL',
            'complained' => 'complained_at IS NOT NULL',
        );
        if (isset($map[$filter])) {
            $where[] = $map[$filter];
        }
        $q = $this->str('q', 100);
        if ($q !== '') {
            $where[] = '(email LIKE ? OR name LIKE ?)';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $params[] = $like;
            $params[] = $like;
        }
        return implode(' AND ', $where);
    }

    public function aCampaignRecipients()
    {
        $c = $this->requireCampaign();
        $page = $this->page();
        $per = $this->per(50);
        $params = array((int) $c['id']);
        $w = $this->recipientFilter($params);
        $total = (int) DB::val("SELECT COUNT(*) FROM emt_recipients WHERE $w", $params);
        $rows = DB::all(
            "SELECT id, email, name, status, attempts, error, sent_at, opened_at, opens, clicked_at, clicks, bounce_type, bounced_at, unsubscribed_at, complained_at, next_attempt_at
             FROM emt_recipients WHERE $w ORDER BY id LIMIT " . (int) $per . ' OFFSET ' . (int) (($page - 1) * $per),
            $params
        );
        foreach ($rows as &$r) {
            foreach (array('sent_at', 'opened_at', 'clicked_at', 'bounced_at', 'unsubscribed_at', 'complained_at', 'next_attempt_at') as $k) {
                $r[$k] = Util::iso($r[$k]);
            }
            $r['id'] = (int) $r['id'];
            $r['opens'] = (int) $r['opens'];
            $r['clicks'] = (int) $r['clicks'];
        }
        unset($r);
        return array_merge(array('rows' => $rows), self::paged($total, $page, $per));
    }

    public function aCampaignExport()
    {
        $c = $this->requireCampaign();
        $params = array((int) $c['id']);
        $w = $this->recipientFilter($params);
        $stmt = DB::q(
            "SELECT email, name, status, bounce_type, error, sent_at, opened_at, opens, clicked_at, clicks, bounced_at, unsubscribed_at
             FROM emt_recipients WHERE $w ORDER BY id",
            $params
        );
        $gen = function () use ($stmt) {
            while ($r = $stmt->fetch()) {
                yield $r;
            }
        };
        Util::csvDownload(
            'campaign-' . $c['id'] . '-report.csv',
            array('email', 'name', 'status', 'bounce_type', 'error', 'sent_at_utc', 'first_open_utc', 'opens', 'first_click_utc', 'clicks', 'bounced_at_utc', 'unsubscribed_at_utc'),
            $gen()
        );
    }

    /* ------------------------------------------------------------------ suppression & bounces */

    public function aSuppressionList()
    {
        $page = $this->page();
        $per = $this->per(50);
        $where = array('1=1');
        $params = array();
        $reason = $this->str('reason', 20);
        if (in_array($reason, array('unsubscribed', 'bounced', 'complained', 'invalid', 'manual'), true)) {
            $where[] = 's.reason = ?';
            $params[] = $reason;
        }
        $q = $this->str('q', 100);
        if ($q !== '') {
            $where[] = 's.email LIKE ?';
            $params[] = '%' . addcslashes($q, '%_\\') . '%';
        }
        $w = implode(' AND ', $where);
        $total = (int) DB::val("SELECT COUNT(*) FROM emt_suppressions s WHERE $w", $params);
        $rows = DB::all(
            "SELECT s.email, s.reason, s.detail, s.created_at, c.name campaign FROM emt_suppressions s
             LEFT JOIN emt_campaigns c ON c.id = s.campaign_id WHERE $w ORDER BY s.created_at DESC LIMIT " . (int) $per . ' OFFSET ' . (int) (($page - 1) * $per),
            $params
        );
        foreach ($rows as &$r) {
            $r['created_at'] = Util::iso($r['created_at']);
        }
        unset($r);
        $counts = array('unsubscribed' => 0, 'bounced' => 0, 'complained' => 0, 'invalid' => 0, 'manual' => 0);
        foreach (DB::all('SELECT reason, COUNT(*) n FROM emt_suppressions GROUP BY reason') as $r) {
            $counts[$r['reason']] = (int) $r['n'];
        }
        return array_merge(array('rows' => $rows, 'counts' => $counts), self::paged($total, $page, $per));
    }

    public function aSuppressionAdd()
    {
        $text = $this->raw('emails');
        preg_match_all('/[^\s,;<>"\']+@[^\s,;<>"\']+/', $text, $m);
        $added = 0;
        $invalid = 0;
        foreach (array_unique($m[0]) as $e) {
            $e = Util::normalizeEmail($e);
            if (!Util::isValidEmail($e)) {
                $invalid++;
                continue;
            }
            if (!Suppression::reasonFor($e)) {
                $added++;
            }
            Suppression::add($e, 'manual', $this->str('note', 200) ?: 'Added manually');
        }
        if (!$added && !$invalid) {
            self::fail('No new email addresses found.');
        }
        return array('added' => $added, 'invalid' => $invalid);
    }

    public function aSuppressionRemove()
    {
        $emails = isset($this->in['emails']) && is_array($this->in['emails']) ? $this->in['emails'] : array();
        $n = 0;
        foreach ($emails as $e) {
            Suppression::remove((string) $e);
            $n++;
        }
        return array('removed' => $n);
    }

    public function aSuppressionExport()
    {
        $stmt = DB::q('SELECT email, reason, detail, created_at FROM emt_suppressions ORDER BY created_at DESC');
        $gen = function () use ($stmt) {
            while ($r = $stmt->fetch()) {
                yield $r;
            }
        };
        Util::csvDownload('suppression-list.csv', array('email', 'reason', 'detail', 'added_at_utc'), $gen());
    }

    public function aBouncesList()
    {
        $page = $this->page();
        $per = $this->per(50);
        $params = array();
        $where = '1=1';
        $type = $this->str('type', 20);
        if (in_array($type, array('hard', 'soft', 'complaint', 'unsubscribe'), true)) {
            $where = 'b.type = ?';
            $params[] = $type;
        }
        $total = (int) DB::val("SELECT COUNT(*) FROM emt_bounces b WHERE $where", $params);
        $rows = DB::all(
            "SELECT b.*, c.name campaign FROM emt_bounces b LEFT JOIN emt_campaigns c ON c.id = b.campaign_id
             WHERE $where ORDER BY b.id DESC LIMIT " . (int) $per . ' OFFSET ' . (int) (($page - 1) * $per),
            $params
        );
        foreach ($rows as &$r) {
            $r['received_at'] = Util::iso($r['received_at']);
        }
        unset($r);
        $last = Settings::get('bounce_last_result');
        return array_merge(array(
            'rows' => $rows,
            'enabled' => Settings::bool('pop_enabled'),
            'last_check' => Util::iso(Settings::get('bounce_last_check') ?: null),
            'last_result' => $last ? json_decode($last, true) : null,
        ), self::paged($total, $page, $per));
    }

    public function aBouncesCheck()
    {
        if (!Settings::bool('pop_enabled')) {
            self::fail('Turn on bounce processing in Settings → Bounces first.');
        }
        try {
            $summary = Bounces::check(300);
        } catch (RuntimeException $e) {
            self::fail($e->getMessage());
        }
        return array('summary' => $summary);
    }

    /* ------------------------------------------------------------------ settings */

    private static $settingKeys = array(
        'sender' => array('from_name', 'from_email', 'reply_to', 'mailer', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass'),
        'speed' => array('hourly_limit', 'daily_limit', 'batch_size', 'delay_ms', 'cron_max_seconds', 'check_domains', 'pause_after_failures'),
        'bounces' => array('pop_enabled', 'pop_host', 'pop_port', 'pop_secure', 'pop_user', 'pop_pass', 'pop_delete'),
        'general' => array('app_url', 'timezone', 'company_address', 'auto_footer', 'default_track_opens', 'default_track_clicks'),
    );

    public function aSettingsGet()
    {
        $values = array();
        foreach (self::$settingKeys as $keys) {
            foreach ($keys as $k) {
                $values[$k] = in_array($k, Settings::$secret, true) ? '' : (string) Settings::get($k);
            }
        }
        $config = emt_config();
        $php = defined('PHP_BINDIR') ? PHP_BINDIR . '/php' : 'php';
        return array(
            'values' => $values,
            'has_smtp_pass' => Settings::get('smtp_pass') !== '',
            'has_pop_pass' => Settings::get('pop_pass') !== '',
            'app_url_effective' => Settings::appUrl(),
            'cron' => array(
                'command' => '/usr/local/bin/php ' . EMT_ROOT . '/cron.php >/dev/null 2>&1',
                'php_binary_hint' => $php,
                'url' => Settings::appUrl() . '/cron.php?key=' . $config['cron_key'],
                'last_run' => Util::iso(Settings::get('cron_last_run') ?: null),
                'path' => EMT_ROOT,
            ),
            'server' => array(
                'php' => PHP_VERSION,
                'upload_max' => ini_get('upload_max_filesize'),
                'post_max' => ini_get('post_max_size'),
                'max_execution_time' => ini_get('max_execution_time'),
                'dns' => DomainCheck::available(),
                'openssl' => extension_loaded('openssl'),
            ),
            'timezones' => timezone_identifiers_list(),
        );
    }

    public function aSettingsSave()
    {
        $section = $this->str('section', 20);
        if (!isset(self::$settingKeys[$section])) {
            self::fail('Unknown settings section.');
        }
        $values = isset($this->in['values']) && is_array($this->in['values']) ? $this->in['values'] : array();
        $clean = array();
        foreach (self::$settingKeys[$section] as $k) {
            if (!array_key_exists($k, $values)) {
                continue;
            }
            $v = is_bool($values[$k]) ? ($values[$k] ? '1' : '0') : trim((string) $values[$k]);
            if (in_array($k, Settings::$secret, true) && $v === '') {
                continue; // empty password field = keep the current one
            }
            $clean[$k] = $v;
        }
        // Validation
        foreach (array('from_email', 'smtp_user', 'pop_user') as $k) {
            if (isset($clean[$k])) {
                $clean[$k] = $k === 'from_email' ? Util::normalizeEmail($clean[$k]) : $clean[$k];
            }
        }
        if (isset($clean['from_email']) && !Util::isValidEmail($clean['from_email'])) {
            self::fail('The From email address is not valid.');
        }
        if (isset($clean['reply_to']) && $clean['reply_to'] !== '' && !Util::isValidEmail(Util::normalizeEmail($clean['reply_to']))) {
            self::fail('The Reply-To address is not valid.');
        }
        foreach (array('smtp_secure', 'pop_secure') as $k) {
            if (isset($clean[$k]) && !in_array($clean[$k], array('ssl', 'tls', 'none'), true)) {
                $clean[$k] = 'ssl';
            }
        }
        if (isset($clean['mailer']) && !in_array($clean['mailer'], array('smtp', 'mail'), true)) {
            $clean['mailer'] = 'smtp';
        }
        $ints = array('smtp_port' => array(1, 65535), 'pop_port' => array(1, 65535), 'hourly_limit' => array(0, 100000), 'daily_limit' => array(0, 1000000),
            'batch_size' => array(1, 5000), 'delay_ms' => array(0, 60000), 'cron_max_seconds' => array(20, 3000), 'pause_after_failures' => array(0, 1000));
        foreach ($ints as $k => $range) {
            if (isset($clean[$k])) {
                $clean[$k] = (string) min($range[1], max($range[0], (int) $clean[$k]));
            }
        }
        foreach (array('check_domains', 'pop_enabled', 'pop_delete', 'auto_footer', 'default_track_opens', 'default_track_clicks') as $k) {
            if (isset($clean[$k])) {
                $clean[$k] = in_array($clean[$k], array('1', 'true', 'on'), true) ? '1' : '0';
            }
        }
        if (isset($clean['app_url'])) {
            $clean['app_url'] = rtrim($clean['app_url'], '/');
            if ($clean['app_url'] !== '' && !preg_match('#^https?://[^\s/]+#i', $clean['app_url'])) {
                self::fail('The app URL must start with https:// (e.g. https://marketing.dauddev.com).');
            }
        }
        if (isset($clean['timezone']) && !in_array($clean['timezone'], timezone_identifiers_list(), true)) {
            $clean['timezone'] = 'UTC';
        }
        Settings::setMany($clean);
        Settings::reset();
        return $this->aSettingsGet();
    }

    public function aSettingsTestSmtp()
    {
        $to = Util::normalizeEmail($this->str('to', 191));
        if (!Util::isValidEmail($to)) {
            self::fail('Enter a valid email address to receive the test.');
        }
        if (!Settings::smtpConfigured()) {
            self::fail('Save the SMTP host, username and password first.');
        }
        $html = '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f5fb;padding:32px;">'
            . '<div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;padding:32px;">'
            . '<h2 style="margin:0 0 12px;color:#4f46e5;">It works! 🎉</h2>'
            . '<p style="color:#333;line-height:1.6;">MailPilot can send email through <b>' . Util::h(Settings::get('smtp_host')) . '</b> as <b>'
            . Util::h(Settings::get('from_email')) . '</b>.</p><p style="color:#888;font-size:13px;">Sent ' . gmdate('Y-m-d H:i') . ' UTC</p></div></body></html>';
        $campaign = array('id' => 0, 'subject' => 'MailPilot SMTP test', 'preheader' => '', 'from_name' => '', 'from_email' => '', 'reply_to' => '',
            'html' => $html, 'text_body' => 'MailPilot can send email. This is a test.', 'track_opens' => 0, 'track_clicks' => 0);
        $err = Mailer::sendTest($campaign, $to);
        if ($err) {
            self::fail('Sending failed: ' . $err[1]);
        }
        Settings::set('last_test_email_at', Util::now());
        return array('message' => 'Test email sent to ' . $to . '. Check the inbox (and the spam folder).');
    }

    public function aSettingsTestPop()
    {
        try {
            $pop = Bounces::open();
            $count = count($pop->uidl());
            $pop->quit();
        } catch (RuntimeException $e) {
            self::fail($e->getMessage());
        }
        return array('message' => 'Connected! The mailbox currently holds ' . $count . ' message(s).');
    }
}

/** Releases the session lock early for read-only, potentially slow actions. */
function session_write_close_if_readonly($action)
{
    if (!in_array($action, array('auth.login', 'auth.logout', 'auth.state', 'account.update'), true) && session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}
