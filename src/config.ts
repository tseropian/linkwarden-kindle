import { config as dotenvConfig } from "dotenv";

dotenvConfig();

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export const config = {
  linkwarden: {
    url: required("LINKWARDEN_URL").replace(/\/$/, ""),
    accessToken: required("LINKWARDEN_ACCESS_TOKEN"),
    tagId: parseInt(process.env.LINKWARDEN_TAG_ID || "1", 10),
    sentTagName: process.env.LINKWARDEN_SENT_TAG_NAME || "kindle-sent",
  },
  kindle: {
    email: required("KINDLE_EMAIL"),
  },
  smtp: {
    host: required("SMTP_HOST"),
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: required("SMTP_USER"),
    pass: required("SMTP_PASS"),
    from: required("SMTP_FROM"),
  },
  sendMode: (process.env.SEND_MODE || "individual") as
    | "individual"
    | "digest",
  digestMaxArticles: parseInt(process.env.DIGEST_MAX_ARTICLES || "20", 10),
} as const;
