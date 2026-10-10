// Pure helpers for Gmail messages: headers, body text, cleanup and the free (no AI) filters.

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export function header(msg: GmailMessage, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data && !part.filename) return part;
  for (const p of part.parts ?? []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return null;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Removes quoted earlier messages and signatures, so only the new text is sent to the AI. */
export function stripQuotesAndSignature(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On .{5,200}wrote:$/i.test(t)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(t)) break;
    if (/^-{5,}\s*Forwarded message/i.test(t)) {
      out.push(line);
      continue;
    }
    if (/^From: .+/.test(t) && out.length > 3 && /^_{5,}$|^-{5,}$/.test(out[out.length - 1]?.trim() ?? "")) break;
    if (t === "--" || t === "-- ") break;
    if (/^Sent from my (iPhone|iPad|Android|mobile)/i.test(t)) break;
    if (t.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function messageBody(msg: GmailMessage, maxChars = 6000): string {
  const plain = findPart(msg.payload, "text/plain");
  const html = plain ? null : findPart(msg.payload, "text/html");
  let text = plain?.body?.data
    ? decodeBase64Url(plain.body.data)
    : html?.body?.data
      ? htmlToText(decodeBase64Url(html.body.data))
      : (msg.snippet ?? "");
  text = stripQuotesAndSignature(text);
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n[trimmed]`;
  return text;
}

const SKIP_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS", "SPAM", "TRASH", "CHAT", "DRAFT"];

/**
 * Free filters that run before any AI. Returns a reason to skip, or null to keep.
 * Bills and insurers often send with an unsubscribe header, so that alone isn't a reason to skip.
 */
export function skipReason(msg: GmailMessage): string | null {
  const labels = msg.labelIds ?? [];
  const hit = labels.find((l) => SKIP_LABELS.includes(l));
  if (hit) return `label ${hit}`;
  if (header(msg, "List-Id")) return "mailing list";
  const precedence = header(msg, "Precedence").toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return `precedence ${precedence}`;
  const autoSubmitted = header(msg, "Auto-Submitted").toLowerCase();
  if (autoSubmitted === "auto-replied") return "auto reply";
  const subject = header(msg, "Subject").toLowerCase();
  if (/(verification code|security code|one[- ]time (pass)?code|sign[- ]in code|your login code|password reset)/.test(subject)) {
    return "sign-in code";
  }
  return null;
}

export function emailAddress(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

/** Display name from a From header, e.g. "Pet Insurance <claims@x.com>" gives "Pet Insurance". */
export function senderName(fromHeader: string): string {
  const m = fromHeader.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : fromHeader).trim();
}

export const BACKFILL_QUERY = "newer_than:90d -in:chats -in:spam -in:trash -category:promotions -category:social -category:forums";
