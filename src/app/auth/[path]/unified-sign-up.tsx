"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { signupAction, type SignupState } from "@/actions/signup";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SignupState = { errors: [] };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Creating account
        </>
      ) : (
        "Create account"
      )}
    </Button>
  );
}

export function UnifiedSignUp() {
  const [state, formAction] = useActionState(signupAction, initialState);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!slugEdited) setOrgSlug(slugify(orgName));
  }, [orgName, slugEdited]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 ml-1 inline-flex items-center gap-2.5">
          <img src="/logo.svg" alt="Coznt" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Coznt</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-600">
              AIDLC Governed
            </div>
          </div>
        </Link>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold">Create your workspace</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set up your organization and get started with Coznt.
                </p>
              </div>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/auth/sign-in">Sign In</Link>
              </Button>
            </div>

            {(state?.errors?.length ?? 0) > 0 ? (
              <div className="mb-4 space-y-1 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {state.errors.map((error) => (
                  <div key={error} className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <form action={formAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization name</Label>
                  <Input
                    id="orgName"
                    name="orgName"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="Acme Corporation"
                    required
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Organization slug</Label>
                  <Input
                    id="orgSlug"
                    name="orgSlug"
                    value={orgSlug}
                    onChange={(event) => {
                      setSlugEdited(true);
                      setOrgSlug(slugify(event.target.value));
                    }}
                    placeholder="acme-corporation"
                    required
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner full name</Label>
                <Input
                  id="ownerName"
                  name="ownerName"
                  placeholder="Avery Stone"
                  required
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input
                  id="ownerEmail"
                  name="ownerEmail"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signupPassword">Password</Label>
                <div className="relative">
                  <Input
                    id="signupPassword"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <SubmitButton />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
