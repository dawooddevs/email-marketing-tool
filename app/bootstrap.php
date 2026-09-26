<?php
/**
 * MailPilot bootstrap — loaded by every entry point.
 */
if (!defined('EMT')) {
    define('EMT', 1);
}
define('EMT_VERSION', '1.0.0');
define('EMT_ROOT', dirname(__DIR__));
define('EMT_APP', __DIR__);
define('EMT_STORAGE', EMT_ROOT . '/storage');
define('EMT_CONFIG', EMT_APP . '/config.php');

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
if (is_dir(EMT_STORAGE) && is_writable(EMT_STORAGE)) {
    ini_set('error_log', EMT_STORAGE . '/php-errors.log');
}
// Everything is stored in UTC; the UI converts to the configured timezone.
date_default_timezone_set('UTC');
if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}

require EMT_APP . '/lib/PHPMailer/Exception.php';
require EMT_APP . '/lib/PHPMailer/PHPMailer.php';
require EMT_APP . '/lib/PHPMailer/SMTP.php';

require EMT_APP . '/src/Util.php';
require EMT_APP . '/src/DB.php';
require EMT_APP . '/src/Crypto.php';
require EMT_APP . '/src/Settings.php';
require EMT_APP . '/src/Auth.php';
require EMT_APP . '/src/Schema.php';
require EMT_APP . '/src/DomainCheck.php';
require EMT_APP . '/src/Suppression.php';
require EMT_APP . '/src/Importer.php';
require EMT_APP . '/src/Mailer.php';
require EMT_APP . '/src/Engine.php';
require EMT_APP . '/src/Pop3.php';
require EMT_APP . '/src/BounceParser.php';
require EMT_APP . '/src/Bounces.php';
require EMT_APP . '/src/Campaigns.php';
require EMT_APP . '/src/Api.php';

/** Returns the config array, or null when the app is not installed yet. */
function emt_config()
{
    static $config = false;
    if ($config === false) {
        $config = is_file(EMT_CONFIG) ? require EMT_CONFIG : null;
        if (!is_array($config)) {
            $config = null;
        }
    }
    return $config;
}

function emt_installed()
{
    return emt_config() !== null;
}
