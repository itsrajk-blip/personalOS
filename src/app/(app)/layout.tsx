import { TabBar } from "@/components/TabBar";
import { requireContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireContext();
  return (
    <>
      <main className="page">{children}</main>
      <TabBar />
    </>
  );
}
