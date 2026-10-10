import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * Renders the small subset of formatting the answer prompt asks for: "## " headings, "- " bullets,
 * **bold**, and [n] citations that link to the source item. Everything else is plain text.
 */
export function AnswerText({ text, sourceIds }: { text: string; sourceIds: string[] }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`}>
          {bullets.map((b, i) => (
            <li key={i}>{inline(b, sourceIds)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[-*•] /.test(line)) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) blocks.push(<h3 key={`h${blocks.length}`}>{h[1]}</h3>);
    else blocks.push(<p key={`p${blocks.length}`}>{inline(line, sourceIds)}</p>);
  }
  flush();
  return <div className="answer">{blocks}</div>;
}

function inline(text: string, sourceIds: string[]): ReactNode[] {
  const parts = text.split(/(\[\d+\]|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      const id = sourceIds[Number(cite[1]) - 1];
      return id ? (
        <Link key={i} href={`/items/${id}`} className="cite">
          [{cite[1]}]
        </Link>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      );
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
