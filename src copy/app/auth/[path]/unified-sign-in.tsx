"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";

export function UnifiedSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/projects";
  const invite = searchParams.get("invite");
  const registered = searchParams.get("registered");
  const initialEmail = searchParams.get("email") || "";

  const client = authClient;

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await client.signIn.email({
        email,
        password,
        fetchOptions: {
          onSuccess: () => {
            router.push(`/auth/callback?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          },
        },
      });
      if (result.error) {
        setError(result.error.message || "Sign in failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5 ml-1">
          <img src="/logo.svg" alt="Coznt" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Coznt</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-600 font-medium">AIDLC Governed</div>
          </div>
        </Link>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold">Sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Access your Coznt workspace.
                </p>
              </div>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/auth/sign-up">Sign Up</Link>
              </Button>
            </div>

            {error && (
              <div className="mb-4 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {registered && (
              <div className="mb-4 rounded-sm border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
                Account created. Sign in to continue setup.
              </div>
            )}

            {invite && (
              <div className="mb-4 rounded-sm border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600">
                Invite detected — sign in to continue.
              </div>
            )}

            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    tabIndex={-1}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" variant="default" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              By signing in you agree to our terms
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
