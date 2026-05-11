"use client";

import { useState, useTransition } from "react";
import { FileText, Mail, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { inviteMember, cancelInvitation, removeMember, updateRecruitRole } from "@/actions/team";
import type { RecruitRole } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Member {
  id: string;
  role: string;
  createdAt: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  recruitRole: RecruitRole | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
}

function authRoleLabel(role: string) {
  switch (role) {
    case "owner": return "Owner";
    case "admin": return "Admin";
    default: return "Member";
  }
}

function authRoleBadgeColor(role: string) {
  switch (role) {
    case "owner": return "text-amber-700 bg-amber-50 border-amber-200";
    case "admin": return "text-blue-700 bg-blue-50 border-blue-200";
    default: return "text-muted-foreground bg-secondary border-border";
  }
}

function recruitRoleLabel(role: RecruitRole | null) {
  switch (role) {
    case "hiring_manager": return "Hiring Manager";
    case "recruiter": return "Recruiter";
    default: return null;
  }
}

function recruitRoleBadgeColor(role: RecruitRole | null) {
  switch (role) {
    case "hiring_manager": return "text-violet-700 bg-violet-50 border-violet-200";
    case "recruiter": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    default: return "";
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamClient({
  initialMembers,
  initialInvitations,
}: {
  initialMembers: Member[];
  initialInvitations: Invitation[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [authRole, setAuthRole] = useState<"admin" | "member">("member");
  const [recruitRole, setRecruitRole] = useState<RecruitRole>("recruiter");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await inviteMember(email.trim(), authRole, recruitRole);
      if (result.success) {
        setEmail("");
        setInvitations((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            email: email.trim(),
            role: authRole,
            status: "pending",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            inviterId: "",
          },
        ]);
      } else {
        setError(result.error ?? "Failed to send invitation");
      }
    });
  }

  function handleCancelInvitation(id: string) {
    startTransition(async () => {
      const result = await cancelInvitation(id);
      if (result.success) {
        setInvitations((prev) => prev.filter((i) => i.id !== id));
      }
    });
  }

  function handleRemoveMember(id: string) {
    startTransition(async () => {
      const result = await removeMember(id);
      if (result.success) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
      }
    });
  }

  function handleRecruitRoleChange(userId: string, newRole: RecruitRole) {
    startTransition(async () => {
      const result = await updateRecruitRole(userId, newRole);
      if (result.success) {
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, recruitRole: newRole } : m)),
        );
      }
    });
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-lg font-semibold text-foreground">Team</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Invite people to your organization. Assign them as hiring managers or recruiters.
      </p>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mt-6 space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs font-semibold text-foreground">Email address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs font-semibold text-foreground">Role</Label>
            <Select value={recruitRole} onValueChange={(v) => setRecruitRole(v as RecruitRole)}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recruiter">Recruiter</SelectItem>
                <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label className="text-xs font-semibold text-foreground">Access</Label>
            <Select value={authRole} onValueChange={(v) => setAuthRole(v as "admin" | "member")}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            variant="default"
            disabled={isPending || !email.trim()}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
        </div>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Pending invitations
          </p>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-dashed border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground">{inv.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {inv.role ? authRoleLabel(inv.role) : "Member"} &middot; Expires{" "}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCancelInvitation(inv.id)}
                  disabled={isPending}
                  className="rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="mt-8">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Members
        </p>
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {m.image ? (
                  <img src={m.image} alt={m.name} className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {initials(m.name)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Recruit role selector */}
                {m.role !== "owner" && (
                  <Select
                    value={m.recruitRole ?? "recruiter"}
                    onValueChange={(v) => handleRecruitRoleChange(m.userId, v as RecruitRole)}
                    disabled={isPending}
                  >
                    <SelectTrigger size="sm" className="w-auto text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {/* Performance report link */}
                {m.recruitRole && (
                  <Link
                    href={`/recruit/reports/${m.recruitRole === "recruiter" ? "recruiter" : "hiring-manager"}/${m.userId}`}
                    target="_blank"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title={`View ${recruitRoleLabel(m.recruitRole)} report`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Link>
                )}
                {/* Auth role badge */}
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                    authRoleBadgeColor(m.role),
                  )}
                >
                  {authRoleLabel(m.role)}
                </span>
                {m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={isPending}
                    className="rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
