# linkwarden-to-kindle

Send articles saved in your self-hosted [LinkWarden](https://linkwarden.app) instance to your Kindle via Amazon's Send-to-Kindle email service.

## How it works

1. You tag articles in LinkWarden with a "kindle" tag (or whatever tag you configure)
2. This tool fetches those articles via the LinkWarden API
3. Converts the readable content to EPUB (or HTML as a fallback)
4. Emails the file to your Kindle's `@kindle.com` address
5. Tags the article as `kindle-sent` so it won't be re-sent

## Prerequisites

- **Node.js 24+** (or Docker)
- A **LinkWarden access token** (Settings → Access Tokens in your instance)
- Your **Kindle email address** (Amazon account → Devices → your Kindle)
- An **SMTP account** for sending email (I use Resend.dev)
- The SMTP sender address added to Amazon's **Approved Personal Document E-mail List**

## Setup

```bash
git clone <your-repo>
cd linkwarden-to-kindle
npm install
cp env.example .env
# Edit .env with your details
```

### LinkWarden setup

1. Go to your LinkWarden instance → Settings → Access Tokens
2. Create a new token and copy it into `LINKWARDEN_ACCESS_TOKEN`
3. Create a tag called `kindle` (or whatever you prefer)
4. Find the tag ID — easiest way is to run `npx tsx src/index.ts verify` after setting the URL and token
5. Set `LINKWARDEN_TAG_ID` to that ID

### Amazon setup

1. Go to [Amazon → Manage Your Content and Devices → Preferences](https://www.amazon.com/hz/mycd/myx#/home/settings/payment)
2. Under "Personal Document Settings", find your Kindle's email address
3. Add your SMTP sender address to the "Approved Personal Document E-mail List"

### Format notes (2015 Kindle)

Amazon dropped MOBI support for Send-to-Kindle in late 2023. For your 2015 Kindle:

- **EPUB** — Amazon converts it to KF8/AZW3 on delivery. This is the recommended format.
- **HTML** — Sent as-is, converted on Amazon's end. Good fallback if EPUB has issues. Use `--format html`.

## Usage

```bash
# Check connectivity to LinkWarden + SMTP
npx tsx src/index.ts verify

# List articles queued for Kindle (tagged but not yet sent)
npx tsx src/index.ts list

# Send articles individually as EPUB (default)
npx tsx src/index.ts send

# Dry run — see what would happen without sending
npx tsx src/index.ts send --dry-run

# Send as HTML instead of EPUB
npx tsx src/index.ts send --format html

# Limit to 5 articles
npx tsx src/index.ts send --limit 5

# Send as a single bundled digest EPUB
npx tsx src/index.ts digest

# Digest dry run
npx tsx src/index.ts digest --dry-run
```

## Running on a schedule

### Option A: Host crontab

```bash
npm run build

# Add to crontab — sends at 8pm daily
0 20 * * * cd /path/to/linkwarden-to-kindle && node dist/index.js send --format epub >> /var/log/kindle-send.log 2>&1
```

### Option B: Docker

```bash
docker compose up -d
```

Edit the cron expression in `docker-compose.yml` to change the schedule.

### Option C: systemd timer

```ini
# /etc/systemd/system/kindle-send.service
[Unit]
Description=Send LinkWarden articles to Kindle

[Service]
Type=oneshot
WorkingDirectory=/path/to/linkwarden-to-kindle
ExecStart=/usr/bin/node dist/index.js send --format epub
```

```ini
# /etc/systemd/system/kindle-send.timer
[Unit]
Description=Daily Kindle send

[Timer]
OnCalendar=*-*-* 20:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now kindle-send.timer
```

## Architecture

```mermaid
flowchart TD
    LW[LinkWarden<br/>(self-host)]
    TT[This tool<br/>1. Fetch<br/>2. Convert<br/>3. Email]
    SMTP[Standard SMTP<br/>@kindle.com]
    K[Kindle<br/>(2015)]

    LW -->|GET /api/v1/links| TT
    TT -->|PUT /api/v1/links/:id<br/>(add "kindle-sent" tag)| LW
    TT -->|SMTP| SMTP
    SMTP -->|WiFi sync| K
```

## Troubleshooting

**Articles have no content on Kindle:**
Make sure LinkWarden has archived the readable content. Check that `textContent` is populated — verify with `npx tsx src/index.ts list`. If it shows "Content: none", the article may not have been archived yet.

**SMTP connection fails:**
If using Gmail, you need an [App Password](https://myaccount.google.com/apppasswords), not your regular password. 2FA must be enabled.

**Articles don't appear on Kindle:**
Check your Kindle is on WiFi, verify the sender is in Amazon's Approved list, and try `--format html` as a fallback.

**Duplicate sends:**
The tool tags articles with `kindle-sent` after delivery. Re-running is safe — it only picks up untagged articles.
