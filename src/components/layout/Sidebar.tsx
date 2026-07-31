"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  MapPinned,
  ShieldAlert,
  ScrollText,
  LogOut,
  KeyRound,
  MonitorSmartphone,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/endpoints", label: "Endpoints", icon: MonitorSmartphone },
  { href: "/users", label: "IAM Users", icon: Users },
  { href: "/policies", label: "Policies", icon: ShieldCheck },
  { href: "/provisioning", label: "Agent Provisioning", icon: KeyRound },
  { href: "/assets", label: "Asset Map", icon: MapPinned },
  { href: "/audit", label: "Audit", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-5">
        <ShieldAlert className="h-6 w-6 text-emerald-400" />
        <span className="text-sm font-semibold tracking-wide text-slate-100">
          INSIDER-SHIELD
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-slate-800 text-emerald-400"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-3 py-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>

      <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-600">
        SOC Command Center — v0.1
      </div>
    </aside>
  );
}
