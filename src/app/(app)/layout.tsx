import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";

const NAV = [
  { href: "/projects", label: "Projects" },
  { href: "/plans", label: "Plans" },
  { href: "/rules", label: "Rules" },
  { href: "/skills", label: "Skills" },
  { href: "/approvals", label: "Approvals" },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser } = await getCurrentUser();
  if (!currentUser) redirect("/auth/sign-in");

  return (
    <div className="grid h-dvh grid-cols-[220px_1fr]">
      <aside className="border-r bg-muted/30 px-4 py-6">
        <Link href="/projects" className="mb-6 block text-lg font-semibold">
          dilliznt
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded px-2 py-1.5 hover:bg-muted">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-xs text-muted-foreground">{currentUser.email}</div>
      </aside>
      <main className="overflow-auto p-8">{children}</main>
    </div>
  );
}
