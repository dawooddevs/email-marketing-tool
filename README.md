# MailPilot — email marketing for marketing.dauddev.com

MailPilot is a self-hosted email marketing tool built for **Spaceship shared hosting** (PHP + MySQL + cPanel).
It sends HTML campaigns from **marketing@dauddev.com** to your contact lists ("Email Houses") and shows exactly
what happened to every address.

**What it does**

| Area | Features |
|---|---|
| **Campaigns** | 4-step editor (details → audience → HTML design → review), HTML code editor with live desktop/mobile preview, starter template, `.html` import, merge tags (`{{first_name\|there}}`, `{{email}}`, `{{unsubscribe_url}}` …), test emails, send now or schedule, pause / resume / cancel, duplicate |
| **Email Houses** | Unlimited lists, paste thousands of addresses or upload CSV, automatic syntax validation + de-duplication, domain verification (finds dead domains), search, filter, bulk actions, CSV export |
| **Statistics** | Live progress, delivered, queued, opened, clicked, unsubscribed, **bounced (hard/soft)**, **invalid / vanished addresses**, failed, skipped — per campaign, per recipient (with the server's error message), per link, plus CSV export |
| **Deliverability** | Hourly/daily send limits (Spacemail = 500/hour), retry of temporary errors, auto-pause on repeated failures, global suppression list, one-click unsubscribe headers (Gmail/Yahoo requirement), automatic compliance footer |
| **Bounce processing** | Reads bounce emails from the mailbox over POP3 and marks addresses that no longer exist; also handles spam complaints and "unsubscribe" replies |
| **App-like admin** | Single-page app — everything is AJAX, animated, with dark mode and mobile support |

---

## Step-by-step setup on Spaceship

You need: your Spaceship account, an FTP program ([FileZilla](https://filezilla-project.org/) is free) and ~30 minutes.

### Step 1 — Create the subdomain `marketing.dauddev.com`

1. Log in to **spaceship.com** → open the **Hosting Manager** (use the search icon if you don't see it).
2. Next to your hosting plan click **Manage** → **+ Add domain**.
3. Choose **subdomain**, type `marketing` and select `dauddev.com`.
4. Note the **document root** folder it creates — usually `/home/YOUR_CPANEL_USER/marketing.dauddev.com`.
   This is where the files go.
5. If `dauddev.com` uses Spaceship DNS, the DNS record is created automatically. If your DNS is elsewhere
   (e.g. Cloudflare), add an **A record**: name `marketing` → your hosting server IP (shown in Hosting Manager / cPanel).

### Step 2 — Turn on HTTPS (free SSL)

1. From Hosting Manager open **cPanel**.
2. Go to **Security → SSL/TLS Status**, tick `marketing.dauddev.com` and click **Run AutoSSL**.
3. Wait until it shows a green padlock (can take a few minutes after the DNS is live).

> Tracking links and unsubscribe links must work over HTTPS, otherwise email clients may warn your readers.

### Step 3 — Pick the PHP version

cPanel → **Software → Select PHP Version**:

* choose **PHP 8.1, 8.2 or 8.3** (anything 7.4+ works, 8.2 recommended);
* in the **Extensions** tab make sure these are ticked: `pdo_mysql`, `openssl`, `mbstring` (and `intl`, `fileinfo` if available);
* optional, in **Options**: raise `upload_max_filesize` and `post_max_size` to `32M` if you will upload big CSV files.

### Step 4 — Create the database

cPanel → **Databases → MySQL Database Wizard**:

1. Database name: e.g. `mailpilot` → cPanel shows the full name, e.g. `cpuser_mailpilot`. **Write it down.**
2. Database user: e.g. `mpuser` with a strong generated password → full name e.g. `cpuser_mpuser`. **Write both down.**
3. Privileges: tick **ALL PRIVILEGES** → **Next step**.

### Step 5 — Create the mailbox `marketing@dauddev.com`

Use **one** of these:

**Option A — Spacemail (Spaceship's email service, recommended)**
1. Spaceship → **Spacemail** → create the mailbox `marketing@dauddev.com` and set a password.
2. Spaceship adds the DNS records automatically when your domain uses Spaceship DNS. Settings you will need:

   | | Server | Port | Security |
   |---|---|---|---|
   | SMTP (sending) | `mail.spacemail.com` | `465` | SSL (or `587` STARTTLS) |
   | POP3 (bounces) | `mail.spacemail.com` | `995` | SSL |
   | Username | `marketing@dauddev.com` | | |

**Option B — cPanel email (if your hosting plan includes email)**
1. cPanel → **Email → Email Accounts → + Create** → `marketing@dauddev.com`.
2. Click **Connect Devices** to see the settings — usually host `mail.dauddev.com`, SMTP port `465` SSL, POP3 port `995` SSL.

### Step 6 — DNS records for good deliverability (very important)

Without these, your campaigns go to spam. In Spaceship → **Domains → dauddev.com → DNS records** check that you have:

| Type | Host | Value | Why |
|---|---|---|---|
| TXT | `@` | `v=spf1 include:spf.spacemail.com ~all` | SPF: allows Spacemail to send for your domain (only **one** SPF record allowed — merge includes if you already have one) |
| TXT | `spacemail._domainkey` | `v=DKIM1; k=rsa; p=…` (copy it from Spacemail → your domain → DNS records) | DKIM: signs your emails |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:marketing@dauddev.com` | DMARC: required by Gmail/Yahoo for bulk senders |

When using cPanel email instead, use cPanel → **Email → Email Deliverability** and click **Repair** for SPF and DKIM.
After a few weeks without problems you can make DMARC stricter (`p=quarantine`).

### Step 7 — Upload the files with FTP

1. Download this repository (GitHub → **Code → Download ZIP**) and unzip it on your computer.
2. FTP login details: cPanel → **Files → FTP Accounts** (create one, or use your main cPanel login).
   In FileZilla: Host `ftp.dauddev.com` (or the server IP), your FTP username + password, port `21`.
3. On the right side (server) open the subdomain folder, e.g. `/home/YOUR_CPANEL_USER/marketing.dauddev.com/`.
4. Upload **everything** from the unzipped folder **except** `README.md` and `.gitignore`, keeping the structure:

   ```
   marketing.dauddev.com/
   ├── .htaccess          ← hidden file: make sure it is uploaded (FileZilla → Server → Force showing hidden files)
   ├── index.php          ← the admin app
   ├── api.php            ← AJAX API used by the app
   ├── install.php        ← one-time installer (delete after use!)
   ├── cron.php           ← sending engine (run by the cron job)
   ├── t.php              ← open & click tracking
   ├── u.php              ← unsubscribe page
   ├── assets/            ← css, js, icon
   ├── app/               ← application code (web access is blocked)
   └── storage/           ← runtime data (web access is blocked)
   ```
5. Permissions (right-click → File permissions): folders `755`, files `644`. The `app` and `storage` folders must be writable by PHP (755 is fine on Spaceship).

### Step 8 — Run the installer

1. Open **https://marketing.dauddev.com/install.php** in your browser.
2. All server checks should be green. Fill in:
   * Database host `localhost`, port `3306`, the **full** database name, user and password from Step 4;
   * App URL `https://marketing.dauddev.com`;
   * Timezone (detected from your browser);
   * Admin username `Dawood`. Leave the password empty to keep the pre-configured password (the one you gave Claude).
3. Click **Install MailPilot**.
4. **Delete `install.php`** from the server (FileZilla or cPanel File Manager). The installer refuses to run twice,
   but deleting it is safer.

### Step 9 — First login

1. Open **https://marketing.dauddev.com** and sign in as `Dawood`.
2. A yellow banner reminds you to change the initial password → **Settings → Account**. Do it now.

### Step 10 — Connect the mailbox (SMTP)

**Settings → Sending (SMTP)**:

1. From name `DaudDev`, From email `marketing@dauddev.com`.
2. Click **Spacemail preset** (or **cPanel mail preset**), then enter the mailbox password.
3. Type your personal address in *Send a test to…* → **Send test email**. It should arrive within a minute (check spam too).

**Settings → Tracking & compliance**: check the App URL, and enter your **postal address**
(required by anti-spam laws; shown in the footer).

### Step 11 — Set up the cron job (background sending)

cPanel → **Advanced → Cron Jobs**:

1. **Common Settings → Once Per Five Minutes** (`*/5 * * * *`). Spaceship does not allow shorter intervals.
2. **Command** — copy it from MailPilot → **Settings → Cron job** (the path is filled in for you). It looks like:
   ```
   /usr/local/bin/php /home/YOUR_CPANEL_USER/marketing.dauddev.com/cron.php >/dev/null 2>&1
   ```
3. **Add New Cron Job**. After 5 minutes the Settings → Cron job page shows "Cron is working".

> No cron yet? While a campaign is sending, keeping MailPilot open in a browser tab also sends the emails.
> A URL alternative (for cron-job.org and similar services) is shown on the same settings page.

### Step 12 — Turn on bounce tracking

**Settings → Bounce tracking**:
1. Enable it, host `mail.spacemail.com`, port `995`, SSL, username `marketing@dauddev.com`
   (leave the password empty to reuse the SMTP password).
2. **Test connection**, then **Save**.

The cron job now checks the mailbox about every 10 minutes. Only bounce messages, spam complaints and "unsubscribe" replies are
processed. Your normal emails are never touched.

### Step 13 — Send your first campaign

1. **Email Houses → New Email House** (e.g. "Customers") → **Add contacts**: paste addresses, upload a CSV, or add one.
2. Optional: **Verify domains** marks addresses on dead domains as invalid before you send.
3. **New campaign** → fill in subject/preview text → pick houses → paste your HTML (or use the starter template)
   → **Send test** → **Review & launch** → **Launch**.
4. Watch the live report. You can pause, resume or cancel at any time.

---

## Understanding the numbers

| Stat | Meaning |
|---|---|
| **Recipients** | Unique addresses in the selected houses (duplicates across houses count once) |
| **Delivered** | Accepted by the mail server for delivery |
| **Queued** | Waiting to be sent (respecting your hourly limit) or waiting to retry a temporary error |
| **Opened** | Unique people who opened (tracking pixel). Apple Mail pre-loads images, so this can be over-counted |
| **Clicked** | Unique people who clicked a link. Per-link numbers are shown under *Link clicks* |
| **Unsubscribed** | Clicked unsubscribe (or used Gmail's one-click unsubscribe, or replied "unsubscribe") |
| **Bounced — hard** | The receiving server said the mailbox **does not exist** (vanished). The address is suppressed forever |
| **Bounced — soft** | Temporary problem (mailbox full, server busy). Kept; suppressed after 3 soft bounces in 60 days |
| **Invalid / vanished** | Bad address format, or the domain doesn't exist / can't receive email. Detected **before** sending, so it never hurts your reputation |
| **Failed** | Rejected by the mail server for another reason (policy, spam filter). The exact server message is shown |
| **Skipped** | On the suppression list (unsubscribed, bounced before, complained or blocked by you) |

Click any number to see the matching recipients. Click a recipient to see their timeline and the server's exact message.

---

## Sending limits & deliverability

* **Spacemail paid plans allow ~500 emails per hour per mailbox** (trial plans: 20/hour). MailPilot defaults to **400/hour**
  so your normal email keeps working. Change it in **Settings → Speed & limits**.
* **Only email people who opted in.** Spacemail's terms forbid unsolicited bulk email, and they may ask for proof of consent.
* **Warm up** a new mailbox: start with 50–100 emails a day and increase gradually over 2–3 weeks.
* Keep the bounce rate below 2%. Use **Verify domains** and clean your houses of old addresses.
* Spacemail is not designed for large-scale mass mailing. For big lists (thousands per day), use a dedicated
  sending service such as **Brevo, Amazon SES, SMTP2GO or Mailgun**. Verify `dauddev.com` with them, add their SPF/DKIM
  records and enter their SMTP details in **Settings → Sending**. Nothing else changes.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank page / 500 error | Check PHP version & extensions (Step 3). Look at `storage/php-errors.log` via File Manager |
| "Could not connect to SMTP host" | Check host/port/security. Try port `587` + STARTTLS. Some hosts block outgoing SMTP to external servers: in cPanel → **Security → SMTP Restrictions** (if present) allow it, or ask Spaceship support |
| "Could not authenticate" | Wrong mailbox password, or the username is not the full email address |
| Test email lands in spam | Add SPF, DKIM and DMARC (Step 6), send from the real mailbox address, avoid spammy words and image-only emails |
| Campaign stuck at "Queued" | Cron not running (Settings → Cron job shows the last run). Check the PHP path in the cron command, e.g. `/opt/alt/php82/usr/bin/php` on some servers |
| "Hourly limit reached" | Normal: sending continues automatically when the hour resets |
| CSV upload fails | Raise `upload_max_filesize` (Step 3) or split the file |
| Tracking/unsubscribe links broken | **Settings → Tracking & compliance → App URL** must be `https://marketing.dauddev.com` |

---

## Updating MailPilot later

Upload the new files over the old ones, but **never overwrite or delete** `app/config.php` (your database settings and
secret keys) or the `storage/` folder. Database tables are created with `IF NOT EXISTS`, so re-uploading is safe.

## Security notes

* All admin actions require login and a CSRF token; login is rate-limited (8 failed attempts / 15 minutes).
* SMTP/POP passwords are stored encrypted (AES-256-GCM) with a key that only exists in `app/config.php`.
* `app/` and `storage/` are blocked from the web by `.htaccess`, and every PHP file in them refuses direct access.
* Tracking and unsubscribe links are signed (HMAC), so they cannot be forged or guessed.
* Delete `install.php` after installation and change the initial password.

## Tech overview

Plain PHP 7.4+ (no framework, no Composer needed on the server), MySQL/MariaDB, [PHPMailer](https://github.com/PHPMailer/PHPMailer)
(bundled in `app/lib`, LGPL-2.1), vanilla JavaScript single-page app (CodeMirror is loaded from cdnjs for the HTML editor,
with a plain-textarea fallback).

```
app/src/Engine.php        sending engine: queue, throttling, retries, auto-pause
app/src/Mailer.php        builds personalised messages (tracking, unsubscribe headers) and classifies SMTP errors
app/src/Bounces.php       POP3 bounce processing  ·  app/src/BounceParser.php  DSN / ARF parser
app/src/Campaigns.php     campaign lifecycle and statistics
app/src/Importer.php      paste / CSV import with validation
app/src/Api.php           JSON API used by assets/js/*.js
```
