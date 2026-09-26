<?php
/**
 * Sending engine runner.
 *
 * cPanel cron (every 5 minutes):
 *   /usr/local/bin/php /home/YOUR_USER/marketing.dauddev.com/cron.php >/dev/null 2>&1
 * or by URL (e.g. from cron-job.org):
 *   https://marketing.dauddev.com/cron.php?key=YOUR_CRON_KEY
 */
define('EMT', 1);
require __DIR__ . '/app/bootstrap.php';

$cli = PHP_SAPI === 'cli';
if (!emt_installed()) {
    if (!$cli) {
        http_response_code(503);
    }
    echo "MailPilot is not installed yet.\n";
    exit(1);
}
if (!$cli) {
    $config = emt_config();
    $key = isset($_GET['key']) ? (string) $_GET['key'] : '';
    if ($key === '' || !hash_equals((string) $config['cron_key'], $key)) {
        http_response_code(403);
        echo 'Forbidden';
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
}

$budget = max(20, Settings::int('cron_max_seconds'));
Util::longRunning($budget + 120);
if (!$cli) {
    // Web requests are bound by max_execution_time — stay safely below it.
    $limit = (int) ini_get('max_execution_time');
    if ($limit > 0) {
        $budget = max(10, min($budget, $limit - 10));
    }
}

try {
    $summary = Engine::run('cron', $budget);
} catch (Throwable $e) {
    error_log('[MailPilot cron] ' . $e->getMessage());
    echo 'Error: ' . $e->getMessage() . "\n";
    exit(1);
}
echo '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $summary['status']
    . ' — sent ' . $summary['sent'] . ', failed ' . $summary['failed'] . ', invalid ' . $summary['invalid']
    . ', bounced ' . $summary['bounced'] . ', deferred ' . $summary['deferred'] . ', skipped ' . $summary['skipped']
    . ($summary['message'] !== '' ? ' — ' . $summary['message'] : '') . "\n";
if (isset($summary['bounces'])) {
    echo 'Bounce check: ' . json_encode($summary['bounces']) . "\n";
}
