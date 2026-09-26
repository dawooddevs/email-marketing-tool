<?php
defined('EMT') or exit;

/** Database schema. All statements are idempotent (CREATE TABLE IF NOT EXISTS). */
class Schema
{
    /** Pre-configured admin account (password is stored only as a bcrypt hash). */
    const DEFAULT_ADMIN_USER = 'Dawood';
    const DEFAULT_ADMIN_HASH = '$2y$12$hclc1cKZSbvSsvnKBqF5guOceFkYKxvqwT3kV29TNnoLqaQlGWg.i';

    public static function statements()
    {
        $t = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        return array(
            "CREATE TABLE IF NOT EXISTS emt_users (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                must_change TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL,
                last_login_at DATETIME NULL,
                UNIQUE KEY uniq_username (username)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_settings (
                k VARCHAR(64) NOT NULL PRIMARY KEY,
                v MEDIUMTEXT NULL
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_login_attempts (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                ip VARCHAR(45) NOT NULL,
                attempted_at DATETIME NOT NULL,
                KEY idx_ip_time (ip, attempted_at)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_lists (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                description VARCHAR(255) NOT NULL DEFAULT '',
                color VARCHAR(20) NOT NULL DEFAULT 'violet',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_contacts (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                list_id INT UNSIGNED NOT NULL,
                email VARCHAR(191) NOT NULL,
                name VARCHAR(191) NOT NULL DEFAULT '',
                status ENUM('active','unsubscribed','bounced','invalid','complained') NOT NULL DEFAULT 'active',
                note VARCHAR(255) NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NULL,
                UNIQUE KEY uniq_list_email (list_id, email),
                KEY idx_email (email),
                KEY idx_list_status (list_id, status),
                CONSTRAINT fk_contacts_list FOREIGN KEY (list_id) REFERENCES emt_lists (id) ON DELETE CASCADE
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_suppressions (
                email VARCHAR(191) NOT NULL PRIMARY KEY,
                reason ENUM('unsubscribed','bounced','complained','invalid','manual') NOT NULL,
                detail VARCHAR(255) NOT NULL DEFAULT '',
                campaign_id INT UNSIGNED NULL,
                created_at DATETIME NOT NULL,
                KEY idx_reason (reason)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_campaigns (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(191) NOT NULL,
                subject VARCHAR(255) NOT NULL DEFAULT '',
                preheader VARCHAR(255) NOT NULL DEFAULT '',
                from_name VARCHAR(150) NOT NULL DEFAULT '',
                from_email VARCHAR(191) NOT NULL DEFAULT '',
                reply_to VARCHAR(191) NOT NULL DEFAULT '',
                html MEDIUMTEXT NULL,
                text_body MEDIUMTEXT NULL,
                track_opens TINYINT(1) NOT NULL DEFAULT 1,
                track_clicks TINYINT(1) NOT NULL DEFAULT 1,
                status ENUM('draft','scheduled','sending','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
                scheduled_at DATETIME NULL,
                started_at DATETIME NULL,
                completed_at DATETIME NULL,
                total INT UNSIGNED NOT NULL DEFAULT 0,
                last_error VARCHAR(500) NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                KEY idx_status (status)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_campaign_lists (
                campaign_id INT UNSIGNED NOT NULL,
                list_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (campaign_id, list_id),
                CONSTRAINT fk_cl_campaign FOREIGN KEY (campaign_id) REFERENCES emt_campaigns (id) ON DELETE CASCADE
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_links (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                campaign_id INT UNSIGNED NOT NULL,
                url TEXT NOT NULL,
                clicks INT UNSIGNED NOT NULL DEFAULT 0,
                unique_clicks INT UNSIGNED NOT NULL DEFAULT 0,
                KEY idx_campaign (campaign_id),
                CONSTRAINT fk_links_campaign FOREIGN KEY (campaign_id) REFERENCES emt_campaigns (id) ON DELETE CASCADE
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_recipients (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                campaign_id INT UNSIGNED NOT NULL,
                contact_id INT UNSIGNED NULL,
                email VARCHAR(191) NOT NULL,
                name VARCHAR(191) NOT NULL DEFAULT '',
                status ENUM('pending','sent','failed','invalid','bounced','skipped') NOT NULL DEFAULT 'pending',
                attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                next_attempt_at DATETIME NULL,
                error VARCHAR(500) NULL,
                sent_at DATETIME NULL,
                opened_at DATETIME NULL,
                opens INT UNSIGNED NOT NULL DEFAULT 0,
                clicked_at DATETIME NULL,
                clicks INT UNSIGNED NOT NULL DEFAULT 0,
                bounce_type ENUM('hard','soft') NULL,
                bounced_at DATETIME NULL,
                unsubscribed_at DATETIME NULL,
                complained_at DATETIME NULL,
                UNIQUE KEY uniq_campaign_email (campaign_id, email),
                KEY idx_campaign_status (campaign_id, status),
                KEY idx_email (email),
                KEY idx_sent_at (sent_at),
                CONSTRAINT fk_rcpt_campaign FOREIGN KEY (campaign_id) REFERENCES emt_campaigns (id) ON DELETE CASCADE
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_link_clicks (
                recipient_id INT UNSIGNED NOT NULL,
                link_id INT UNSIGNED NOT NULL,
                clicked_at DATETIME NOT NULL,
                PRIMARY KEY (recipient_id, link_id)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_send_log (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                sent_at DATETIME NOT NULL,
                KEY idx_sent_at (sent_at)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_bounces (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(191) NOT NULL DEFAULT '',
                recipient_id INT UNSIGNED NULL,
                campaign_id INT UNSIGNED NULL,
                type ENUM('hard','soft','complaint','unsubscribe') NOT NULL,
                code VARCHAR(20) NOT NULL DEFAULT '',
                diagnostic VARCHAR(500) NOT NULL DEFAULT '',
                subject VARCHAR(255) NOT NULL DEFAULT '',
                received_at DATETIME NOT NULL,
                KEY idx_email (email),
                KEY idx_campaign (campaign_id)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_mailbox_seen (
                uidl VARCHAR(191) NOT NULL PRIMARY KEY,
                seen_at DATETIME NOT NULL,
                KEY idx_seen (seen_at)
            )$t",
            "CREATE TABLE IF NOT EXISTS emt_domains (
                domain VARCHAR(191) NOT NULL PRIMARY KEY,
                valid TINYINT(1) NOT NULL,
                checked_at DATETIME NOT NULL
            )$t",
        );
    }

    /** Creates all tables and seeds the admin account + default settings. */
    public static function install($adminUser = null, $adminPassword = null)
    {
        foreach (self::statements() as $sql) {
            DB::pdo()->exec($sql);
        }
        $username = $adminUser !== null && trim($adminUser) !== '' ? trim($adminUser) : self::DEFAULT_ADMIN_USER;
        $hash = $adminPassword !== null && $adminPassword !== '' ? password_hash($adminPassword, PASSWORD_DEFAULT) : self::DEFAULT_ADMIN_HASH;
        $mustChange = ($adminPassword === null || $adminPassword === '') ? 1 : 0;
        if (!DB::val('SELECT COUNT(*) FROM emt_users')) {
            DB::insert('emt_users', array(
                'username' => $username,
                'password_hash' => $hash,
                'must_change' => $mustChange,
                'created_at' => Util::now(),
            ));
        }
    }
}
