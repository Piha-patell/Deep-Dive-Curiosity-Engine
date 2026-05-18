"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";

export function TopNav() {
  const pathname = usePathname();
  const { displayName, isLoading, openAuthModal, profile, signOut, user } = useAuth();

  return (
    <nav className="flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10">
          <Waypoints className="h-5 w-5 text-cyan-200" />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight text-white">DeepDive</p>
          <p className="text-xs text-slate-500">Curiosity engine</p>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        {user ? (
          <>
            <NavLink href="/dives" isActive={pathname.startsWith("/dives")}>
              My Dives
            </NavLink>
            <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 sm:flex">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-cyan-300/15 text-sm font-medium text-cyan-100">
                {getInitials(profile?.first_name, profile?.last_name, displayName)}
              </div>
              <div className="text-sm text-slate-200">{displayName}</div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-4"
              onClick={() => openAuthModal("login")}
              disabled={isLoading}
            >
              Login
            </Button>
            <Button
              type="button"
              className="h-10 px-4"
              onClick={() => openAuthModal("signup")}
              disabled={isLoading}
            >
              Sign up
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition",
        isActive
          ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

function getInitials(firstName?: string, lastName?: string, fallback?: string) {
  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((value) => value!.trim()[0])
    .join("");

  if (initials) return initials.toUpperCase();
  return fallback?.trim().slice(0, 2).toUpperCase() || "DD";
}
