import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth";

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const data = await ctx.store.exportAll();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="personalos-export-${date}.json"`,
    },
  });
}
