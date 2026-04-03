import { Command } from "commander";
import { config } from "./config.js";
import { LinkWardenClient } from "./linkwarden.js";
import {
  generateEpub,
  generateDigestEpub,
  generateHtml,
} from "./epub.js";
import { sendToKindle, verifySmtp, sendTestEmail } from "./mailer.js";

const client = new LinkWardenClient();

// ── Helpers ────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// ── Commands ───────────────────────────────────────────────────────────

/**
 * List unsent articles (tagged "kindle" but not "kindle-sent").
 */
async function listUnsent(): Promise<void> {
  const links = await client.getUnsentLinks();

  if (links.length === 0) {
    log("No unsent articles found. Tag articles with your kindle tag to queue them.");
    return;
  }

  console.log(`\n  ${links.length} unsent article(s):\n`);
  for (const link of links) {
    const tags = link.tags.map((t) => t.name).join(", ");
    console.log(`  [${link.id}] ${link.name}`);
    console.log(`         ${link.url}`);
    console.log(`         Tags: ${tags}`);
    console.log(`         Content: ${link.textContent ? `${link.textContent.length} chars` : "none"}`);
    console.log();
  }
}

/**
 * Send individual articles to Kindle.
 * Each article becomes one EPUB file sent as a separate email.
 */
async function sendIndividual(options: {
  dryRun: boolean;
  format: "epub" | "html";
  limit?: number;
}): Promise<void> {
  const links = await client.getUnsentLinks();

  if (links.length === 0) {
    log("No unsent articles to send.");
    return;
  }

  const toSend = options.limit ? links.slice(0, options.limit) : links;
  log(`Sending ${toSend.length} article(s) individually as ${options.format.toUpperCase()}...`);

  for (const link of toSend) {
    const slug = slugify(link.name || `article-${link.id}`);
    const filename = `${slug}.${options.format}`;

    log(`Processing: "${link.name}" (ID: ${link.id})`);

    try {
      let content: Buffer;

      if (options.format === "epub") {
        content = await generateEpub(link);
      } else {
        content = generateHtml(link);
      }

      if (options.dryRun) {
        log(`  [DRY RUN] Would send ${filename} (${content.length} bytes) to ${config.kindle.email}`);
      } else {
        await sendToKindle({ filename, content, format: options.format });
        log(`  Sent: ${filename} (${content.length} bytes)`);

        // Mark as sent
        await client.addTagToLink(link.id, config.linkwarden.sentTagName);
        log(`  Tagged as "${config.linkwarden.sentTagName}"`);
      }

      // Small delay between sends to avoid SMTP rate limits
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      log(`  ERROR sending "${link.name}": ${err}`);
    }
  }

  log("Done.");
}

/**
 * Send a digest: all unsent articles bundled into one EPUB.
 */
async function sendDigest(options: {
  dryRun: boolean;
  limit?: number;
}): Promise<void> {
  const links = await client.getUnsentLinks();

  if (links.length === 0) {
    log("No unsent articles for digest.");
    return;
  }

  const maxArticles = options.limit || config.digestMaxArticles || links.length;
  const toSend = links.slice(0, maxArticles);

  const date = new Date().toISOString().split("T")[0];
  const filename = `linkwarden-digest-${date}.epub`;

  log(`Generating digest with ${toSend.length} article(s)...`);

  try {
    const content = await generateDigestEpub(toSend);

    if (options.dryRun) {
      log(`[DRY RUN] Would send ${filename} (${content.length} bytes) to ${config.kindle.email}`);
    } else {
      await sendToKindle({
        filename,
        content,
        format: "epub",
        subject: "",
      });
      log(`Sent digest: ${filename} (${content.length} bytes)`);

      // Mark all as sent
      for (const link of toSend) {
        await client.addTagToLink(link.id, config.linkwarden.sentTagName);
      }
      log(`Tagged ${toSend.length} articles as "${config.linkwarden.sentTagName}"`);
    }
  } catch (err) {
    log(`ERROR generating/sending digest: ${err}`);
  }

  log("Done.");
}

// ── CLI ────────────────────────────────────────────────────────────────

const program = new Command()
  .name("linkwarden-to-kindle")
  .description("Send LinkWarden saved articles to your Kindle")
  .version("1.0.0");

program
  .command("list")
  .description("List articles tagged for Kindle that haven't been sent yet")
  .action(async () => {
    await listUnsent();
  });

program
  .command("send")
  .description("Send unsent articles to Kindle individually")
  .option("-n, --dry-run", "Preview what would be sent without sending", false)
  .option(
    "-f, --format <format>",
    "File format: epub or html (html is more reliable for older Kindles)",
    "epub"
  )
  .option("-l, --limit <number>", "Max articles to send", parseInt)
  .action(async (opts) => {
    if (!opts.dryRun) {
      log("Verifying SMTP connection...");
      const ok = await verifySmtp();
      if (!ok) {
        console.error("Cannot connect to SMTP server. Check your .env config.");
        process.exit(1);
      }
      log("SMTP OK.");
    }

    await sendIndividual({
      dryRun: opts.dryRun,
      format: opts.format as "epub" | "html",
      limit: opts.limit,
    });
  });

program
  .command("digest")
  .description("Bundle unsent articles into a single EPUB digest and send")
  .option("-n, --dry-run", "Preview what would be sent without sending", false)
  .option("-l, --limit <number>", "Max articles in digest", parseInt)
  .action(async (opts) => {
    if (!opts.dryRun) {
      log("Verifying SMTP connection...");
      const ok = await verifySmtp();
      if (!ok) {
        console.error("Cannot connect to SMTP server. Check your .env config.");
        process.exit(1);
      }
      log("SMTP OK.");
    }

    await sendDigest({
      dryRun: opts.dryRun,
      limit: opts.limit,
    });
  });

program
  .command("verify")
  .description("Test SMTP and LinkWarden connectivity")
  .action(async () => {
    log("Testing LinkWarden API...");
    try {
      const tags = await client.getTags();
      log(`  Connected. Found ${tags.length} tags.`);
      const kindleTag = tags.find(
        (t) => t.id === config.linkwarden.tagId
      );
      if (kindleTag) {
        log(`  Kindle tag: "${kindleTag.name}" (ID: ${kindleTag.id})`);
      } else {
        log(`  WARNING: No tag found with ID ${config.linkwarden.tagId}. Check LINKWARDEN_TAG_ID.`);
      }
    } catch (err) {
      log(`  LinkWarden connection failed: ${err}`);
    }

    log("Testing SMTP...");
    const smtpOk = await verifySmtp();
    if (smtpOk) {
      log("  SMTP connection OK.");
      log(`  Kindle email: ${config.kindle.email}`);
      log(`  From: ${config.smtp.from}`);
    } else {
      log("  SMTP connection FAILED.");
    }
  });

program
  .command("test-email")
  .description("Send a test email to verify email delivery (no attachments)")
  .action(async () => {
    log("Testing simple email delivery (no attachments)...");

    try {
      await sendTestEmail(config.kindle.email, config.smtp.from);
      log("Test email sent successfully!");
    } catch (error) {
      log(`Failed to send test email: ${error}`);
    }
  });

program.parse();
