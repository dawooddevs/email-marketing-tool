<?php
defined('EMT') or exit;

/** Session based authentication, CSRF protection and login throttling. */
class Auth
{
    const MAX_ATTEMPTS = 8;
    const WINDOW_MINUTES = 15;

    public static function startSession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $dir = EMT_STORAGE . '/sessions';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
            // Our own directory: we control garbage collection, keep sessions 14 days.
            ini_set('session.gc_maxlifetime', (string) (14 * 86400));
        }
        session_name('mailpilot_sid');
        $params = array(
            'lifetime' => 14 * 86400,
            'path' => '/',
            'secure' => Util::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        );
        if (PHP_VERSION_ID >= 70300) {
            session_set_cookie_params($params);
        } else {
            session_set_cookie_params($params['lifetime'], '/; samesite=Lax', '', $params['secure'], true);
        }
        ini_set('session.use_strict_mode', '1');
        session_start();
    }

    public static function user()
    {
        self::startSession();
        if (empty($_SESSION['uid'])) {
            return null;
        }
        $user = DB::one('SELECT id, username, must_change, last_login_at FROM emt_users WHERE id = ?', array((int) $_SESSION['uid']));
        if (!$user) {
            unset($_SESSION['uid']);
            return null;
        }
        return $user;
    }

    public static function csrfToken()
    {
        self::startSession();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = Util::randomHex(32);
        }
        return $_SESSION['csrf'];
    }

    public static function checkCsrf($token)
    {
        self::startSession();
        return !empty($_SESSION['csrf']) && is_string($token) && hash_equals($_SESSION['csrf'], $token);
    }

    public static function tooManyAttempts()
    {
        $since = Util::now(-self::WINDOW_MINUTES * 60);
        $count = (int) DB::val('SELECT COUNT(*) FROM emt_login_attempts WHERE ip = ? AND attempted_at >= ?', array(Util::clientIp(), $since));
        return $count >= self::MAX_ATTEMPTS;
    }

    /** @return array|string user row on success, error message on failure */
    public static function attempt($username, $password)
    {
        if (self::tooManyAttempts()) {
            return 'Too many failed attempts. Please wait ' . self::WINDOW_MINUTES . ' minutes and try again.';
        }
        $user = DB::one('SELECT * FROM emt_users WHERE username = ?', array(trim((string) $username)));
        if (!$user || !password_verify((string) $password, $user['password_hash'])) {
            DB::insert('emt_login_attempts', array('ip' => Util::clientIp(), 'attempted_at' => Util::now()));
            // Small delay to slow down brute force attempts.
            usleep(400000);
            return 'Incorrect username or password.';
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            DB::update('emt_users', array('password_hash' => password_hash($password, PASSWORD_DEFAULT)), 'id = ?', array($user['id']));
        }
        self::startSession();
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $user['id'];
        $_SESSION['csrf'] = Util::randomHex(32);
        DB::exec('DELETE FROM emt_login_attempts WHERE ip = ? OR attempted_at < ?', array(Util::clientIp(), Util::now(-86400)));
        DB::update('emt_users', array('last_login_at' => Util::now()), 'id = ?', array($user['id']));
        return $user;
    }

    public static function logout()
    {
        self::startSession();
        $_SESSION = array();
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }
}
