"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnswerText } from "@/components/AnswerText";

const EXAMPLES = [
  "Brief me for Joey's vet visit",
  "Brief me for my GP visit",
  "What bills are due this month?",
  "When did I last have a headache?",
];

interface Source {
  id: string;
  source: string;
  summary: string | null;
  happened_on: string | null;
}
interface Answer {
  question: string;
  text: string;
  scope: string;
  cost: number;
  sources: Source[];
}

export function AskForm({ initial }: { initial: string }) {
  const [question, setQuestion] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setAnswer({ question: q, ...json });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // A "Brief me" button opens this page with the question filled in; run it straight away.
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      void ask(initial);
    }
  }, [initial]);

  async function copy() {
    if (!answer) return;
    const plain = answer.text.replace(/\[\d+\]/g, "").replace(/\*\*/g, "").replace(/^## /gm, "");
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          id="ask-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about anything you've recorded"
          style={{ minHeight: 80 }}
          aria-label="Question"
        />
        <button className="btn primary" type="submit" disabled={busy || !question.trim()}>
          {busy ? "Reading your records…" : "Ask"}
        </button>
      </form>

      {!answer && !busy && (
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" style={{ padding: "6px 12px", cursor: "pointer", font: "inherit", fontSize: 13 }} onClick={() => { setQuestion(ex); void ask(ex); }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {answer && (
        <>
          <div className="bubble">{answer.question}</div>
          <div className="card">
            <span className="eyebrow">{answer.scope}</span>
            <AnswerText text={answer.text} sourceIds={answer.sources.map((s) => s.id)} />
            <span className="hint mono" style={{ fontSize: 11 }}>
              Based on {answer.sources.length} record{answer.sources.length === 1 ? "" : "s"} · cost about {Math.max(1, Math.round(answer.cost * 100))}c · records only, not medical advice
            </span>
          </div>
          <div className="actions">
            <button className="btn small" type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <button className="btn small" type="button" onClick={() => { setAnswer(null); setQuestion(""); }}>New question</button>
          </div>
          {answer.sources.length > 0 && (
            <details>
              <summary className="sub" style={{ cursor: "pointer" }}>Sources</summary>
              <div className="list" style={{ marginTop: 8 }}>
                {answer.sources.map((s, i) => (
                  <Link key={s.id} href={`/items/${s.id}`}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      [{i + 1}] {s.summary ?? "Untitled"}
                    </span>
                    <span className="v">{s.happened_on ?? ""}</span>
                  </Link>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
