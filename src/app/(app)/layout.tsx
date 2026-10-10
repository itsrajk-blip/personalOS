import { Suspense } from "react";
import { NavProgress } from "@/components/NavProgress";
import { TabBar } from "@/components/TabBar";
import { requireContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireContext();
  return (
    <Suspense>
      <NavProgress>
        <main className="page">{children}</main>
        <TabBar />
      </NavProgress>
    </Suspense>
  );
}
