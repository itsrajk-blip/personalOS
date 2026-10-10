import { AskForm } from "./AskForm";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <div className="page-head">
        <h1>Ask</h1>
        <span className="sub">Answers come only from your records</span>
      </div>
      <AskForm initial={q ?? ""} />
    </>
  );
}
