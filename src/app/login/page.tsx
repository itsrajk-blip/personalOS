import { redirect } from "next/navigation";
import { LoginButton } from "./LoginButton";
import { getContext } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getContext()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="page" style={{ justifyContent: "center", minHeight: "100dvh", paddingBottom: 40 }}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="eyebrow">Private</div>
        <h1 style={{ fontSize: 36 }}>PersonalOS</h1>
        <p className="sub" style={{ fontSize: 16 }}>Your household record: notes, photos and Gmail, filed and ready when you need them.</p>
        {error === "not_allowed" && (
          <p className="notice warn">That Google account isn&apos;t on the list for this app.</p>
        )}
        {error === "failed" && <p className="notice warn">Sign-in didn&apos;t complete. Try again.</p>}
        <LoginButton />
      </div>
    </main>
  );
}
