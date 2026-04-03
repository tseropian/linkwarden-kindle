import type { LinkWardenLink } from "./linkwarden.js";

// epub-gen-memory types
interface EpubChapter {
  title: string;
  content: string;
}

/**
 * Wrap article text content in basic HTML structure for EPUB chapters.
 * LinkWarden's textContent is the readable-extracted plain text.
 * We convert line breaks to paragraphs for better Kindle rendering.
 */
function textToHtml(text: string, sourceUrl: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return `
    <div style="font-family: serif; line-height: 1.6;">
      ${paragraphs}
      <hr/>
      <p style="font-size: 0.8em; color: #666;">
        Original: <a href="${sourceUrl}">${sourceUrl}</a>
      </p>
    </div>
  `;
}

/**
 * Generate an EPUB buffer for a single article.
 */
export async function generateEpub(
  link: LinkWardenLink
): Promise<Buffer> {
  // Dynamic import because epub-gen-memory is ESM
  const epubGen = await import("epub-gen-memory");
  const generate = epubGen.default || epubGen;

  const articleContent = link.textContent || link.description || "No content available.";

  const chapters: EpubChapter[] = [
    {
      title: link.name || "Article",
      content: textToHtml(articleContent, link.url),
    },
  ];

  const options = {
    title: link.name || "Untitled Article",
    author: "LinkWarden",
    description: link.description || undefined,
    date: link.createdAt,
  };

  const epubBuffer = await generate(options, chapters);
  return Buffer.from(epubBuffer);
}

/**
 * Generate a digest EPUB containing multiple articles as chapters.
 */
export async function generateDigestEpub(
  links: LinkWardenLink[]
): Promise<Buffer> {
  const epubGen = await import("epub-gen-memory");
  const generate = epubGen.default || epubGen;

  const date = new Date().toISOString().split("T")[0];

  const chapters: EpubChapter[] = links.map((link) => {
    const content = link.textContent || link.description || "No content available.";
    return {
      title: link.name || "Untitled",
      content: textToHtml(content, link.url),
    };
  });

  const options = {
    title: `LinkWarden Digest — ${date}`,
    author: "LinkWarden",
    description: `${links.length} articles from LinkWarden`,
    date,
  };

  const epubBuffer = await generate(options, chapters);
  return Buffer.from(epubBuffer);
}

/**
 * Alternative: generate a simple HTML file for a single article.
 * HTML is natively supported by Send-to-Kindle and works on all Kindles.
 * This is the fallback if EPUB generation has issues.
 */
export function generateHtml(link: LinkWardenLink): Buffer {
  const content = link.textContent || link.description || "No content available.";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(link.name || "Article")}</title>
  <style>
    body { font-family: serif; line-height: 1.6; max-width: 40em; margin: 2em auto; padding: 0 1em; }
    h1 { font-size: 1.4em; margin-bottom: 0.5em; }
    .meta { color: #666; font-size: 0.85em; margin-bottom: 2em; }
    .source { font-size: 0.8em; color: #666; border-top: 1px solid #ccc; padding-top: 1em; margin-top: 2em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(link.name || "Untitled")}</h1>
  <div class="meta">
    <span>Saved: ${new Date(link.createdAt).toLocaleDateString()}</span>
    ${link.tags.length > 0 ? `<br/><span>Tags: ${link.tags.map((t) => t.name).join(", ")}</span>` : ""}
  </div>
  ${content
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n")}
  <div class="source">
    <a href="${escapeHtml(link.url)}">Original article</a>
  </div>
</body>
</html>`;

  return Buffer.from(html, "utf-8");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
