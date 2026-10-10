"use client";
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PushSettings({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone only offers push to apps saved to the home screen.
        setState(/iPhone|iPad/.test(navigator.userAgent) && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setMsg(null);
    try {
      if (!vapidKey) throw new Error("Notifications aren't set up on the server yet (VAPID keys missing).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error("Couldn't save the subscription.");
      setState("on");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't turn on notifications.");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  async function test() {
    setMsg(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Test sent to ${json.sent} device(s).` : (json.error ?? "Test failed."));
  }

  return (
    <div className="card">
      {state === "loading" && <p className="sub">Checking…</p>}
      {state === "unsupported" && <p>This browser can&apos;t receive notifications.</p>}
      {state === "needs-install" && (
        <p>
          To get notifications on iPhone, add this app to your home screen first: tap Share, then <strong>Add to Home Screen</strong>, then open it from there.
        </p>
      )}
      {state === "denied" && <p>Notifications are blocked. Turn them on in iPhone Settings, Notifications, PersonalOS.</p>}
      {state === "off" && (
        <>
          <p>A 7am summary of what&apos;s due, and an alert when Gmail turns up something due within 3 days.</p>
          <button className="btn primary" type="button" onClick={enable}>Turn on notifications</button>
        </>
      )}
      {state === "on" && (
        <>
          <div className="row">
            <span>Daily summary at 7:00am, Gmail alerts</span>
            <span className="spacer" />
            <span className="state ok">On</span>
          </div>
          <div className="actions">
            <button className="btn small" type="button" onClick={test}>Send a test</button>
            <button className="btn small" type="button" onClick={disable}>Turn off on this device</button>
          </div>
        </>
      )}
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
