import { describe, expect, it } from "vitest";
import { emailAddress, htmlToText, messageBody, senderName, skipReason, stripQuotesAndSignature, type GmailMessage } from "@/lib/gmail/parse";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

function msg(p: { labels?: string[]; headers?: Record<string, string>; text?: string; html?: string }): GmailMessage {
  const headers = Object.entries(p.headers ?? {}).map(([name, value]) => ({ name, value }));
  const parts = [
    ...(p.text ? [{ mimeType: "text/plain", body: { data: b64(p.text) } }] : []),
    ...(p.html ? [{ mimeType: "text/html", body: { data: b64(p.html) } }] : []),
  ];
  return { id: "m1", threadId: "t1", labelIds: p.labels ?? ["INBOX"], payload: { mimeType: "multipart/alternative", headers, parts } };
}

describe("free Gmail filters", () => {
  it("skips promotions, social and mailing lists", () => {
    expect(skipReason(msg({ labels: ["INBOX", "CATEGORY_PROMOTIONS"] }))).toMatch(/PROMOTIONS/);
    expect(skipReason(msg({ headers: { "List-Id": "<news.example.com>" } }))).toBe("mailing list");
    expect(skipReason(msg({ headers: { Precedence: "bulk" } }))).toMatch(/bulk/);
    expect(skipReason(msg({ headers: { Subject: "Your verification code is 123456" } }))).toBe("sign-in code");
  });

  it("keeps a bill even when it has an unsubscribe header", () => {
    expect(skipReason(msg({ labels: ["INBOX", "CATEGORY_UPDATES"], headers: { "List-Unsubscribe": "<mailto:x>", Subject: "Your invoice" } }))).toBeNull();
  });
});

describe("email body cleanup", () => {
  it("prefers plain text and drops the quoted thread and signature", () => {
    const text = "Thanks Raj, we'll get back to you within 10 business days.\n\nKind regards\n--\nClaims team\n\nOn Mon, 1 Sep 2026 at 9:00 Raj <raj@example.com> wrote:\n> Any update on my claim?";
    const body = messageBody(msg({ text, html: "<p>ignored</p>" }));
    expect(body).toContain("within 10 business days");
    expect(body).not.toContain("Any update");
    expect(body).not.toContain("Claims team");
  });

  it("falls back to HTML converted to text", () => {
    const body = messageBody(msg({ html: "<html><style>p{}</style><p>Invoice&nbsp;#42</p><p>Due 24 Oct</p></html>" }));
    expect(body).toBe("Invoice #42\nDue 24 Oct");
  });

  it("strips '>' quoted lines", () => {
    expect(stripQuotesAndSignature("New text\n> old\n> older")).toBe("New text");
  });

  it("converts entities", () => {
    expect(htmlToText("A &amp; B &#39;C&#39;")).toBe("A & B 'C'");
  });
});

describe("addresses", () => {
  it("parses From headers", () => {
    expect(emailAddress('"Pet Insurance" <Claims@Example.com>')).toBe("claims@example.com");
    expect(senderName('"Pet Insurance" <claims@example.com>')).toBe("Pet Insurance");
    expect(senderName("claims@example.com")).toBe("claims@example.com");
  });
});
