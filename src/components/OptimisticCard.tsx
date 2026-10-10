"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

const HideContext = createContext<() => void>(() => {});

/** A card that disappears as soon as you act on it, without waiting for the server. */
export function OptimisticCard({ className, children }: { className: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <HideContext.Provider value={() => setHidden(true)}>
      <div className={className}>{children}</div>
    </HideContext.Provider>
  );
}

/**
 * A one-button form that runs a server action. With `hides`, the surrounding card is removed
 * immediately; otherwise the button shows that it's working.
 */
export function ActionButton({
  action,
  fields,
  label,
  className = "btn small",
  hides = false,
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  className?: string;
  hides?: boolean;
}) {
  const hide = useContext(HideContext);
  return (
    <form action={action} onSubmit={hides ? () => setTimeout(hide, 0) : undefined}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit label={label} className={className} />
    </form>
  );
}

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}
