import { Sidebar } from "@/components/layout/Sidebar";

// Split out of the root layout so /login (outside this route group) can
// render without the app's nav — src/proxy.ts already fully blocks
// navigation into any of these routes without a session, but showing
// a sidebar full of dead links next to the login form would be a
// confusing, unpolished UX regardless.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </>
  );
}
