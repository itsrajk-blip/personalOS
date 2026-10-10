import "server-only";
import { env } from "../env";
import type { GmailMessage } from "./parse";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailRedirectUri(): string {
  return `${env.appUrl()}/api/gmail/callback`;
}

export function authUrl(state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.googleClientId(), client_secret: env.googleClientSecret(), ...body }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new GmailAuthError(json.error_description ?? json.error ?? `Token request failed (${res.status})`, json.error);
  }
  return json;
}

export class GmailAuthError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: gmailRedirectUri() });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const json = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return json.access_token!;
}

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class Gmail {
  constructor(private readonly accessToken: string) {}

  private async get<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x);
    const res = await fetch(`${API}${path}${qs.size ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new GmailApiError(`Gmail ${path} failed: ${res.status} ${await res.text()}`, res.status);
    return (await res.json()) as T;
  }

  profile() {
    return this.get<{ emailAddress: string; historyId: string }>("/profile");
  }

  listMessages(q: string, pageToken?: string) {
    return this.get<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>("/messages", {
      q,
      maxResults: "200",
      ...(pageToken ? { pageToken } : {}),
    });
  }

  message(id: string) {
    return this.get<GmailMessage>(`/messages/${id}`, { format: "full" });
  }

  history(startHistoryId: string, pageToken?: string) {
    return this.get<{
      history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[];
      historyId: string;
      nextPageToken?: string;
    }>("/history", {
      startHistoryId,
      historyTypes: "messageAdded",
      maxResults: "500",
      ...(pageToken ? { pageToken } : {}),
    });
  }
}

export function gmailWebLink(messageId: string, accountEmail?: string): string {
  const who = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : "";
  return `https://mail.google.com/mail/${who}#all/${messageId}`;
}
