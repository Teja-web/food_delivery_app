"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";

const socialProviders = [
  {
    id: "google" as const,
    label: "Continue with Google",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
      </svg>
    ),
  },
  {
    id: "linkedin" as const,
    label: "Continue with LinkedIn",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#0A66C2">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125ZM6.868 20.452H3.804V9h3.064v11.452Z" />
      </svg>
    ),
  },
  {
    id: "github" as const,
    label: "Continue with GitHub",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
      </svg>
    ),
  },
];

export function UnifiedSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const invite = searchParams.get("invite");

  const client = authClient;

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

  const handleSocialSignIn = async (providerId: string) => {
    setError(null);
    setSocialLoading(providerId);
    try {
      // Store callback URL in sessionStorage as fallback
      const finalCallbackUrl = invite ? `${callbackUrl}?invite=${invite}` : callbackUrl;
      sessionStorage.setItem("auth_callback_url", finalCallbackUrl);

      const cbUrl = `/auth/callback?callbackUrl=${encodeURIComponent(finalCallbackUrl)}`;

      await (client as any).signIn.social({
        provider: providerId,
        callbackURL: cbUrl,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
      setSocialLoading(null);
    }
  };

  const anyLoading = isLoading || socialLoading !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5 ml-1">
          <img src="/logo.svg" alt="Coznt" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Coznt</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-600 font-medium">AI powered SDLC</div>
          </div>
        </Link>

        <p className="mb-4 ml-1 text-sm text-muted-foreground">
          Sign in to complete your candidate profile and explore opportunities.
        </p>

        <Card>
          <CardContent className="pt-6">
            {error && (
              <div className="mb-4 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {invite && (
              <div className="mb-4 rounded-sm border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600">
                Invite detected — sign in to continue.
              </div>
            )}

            <div className="space-y-2">
              {socialProviders.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  className="w-full justify-start gap-2.5"
                  disabled={anyLoading}
                  onClick={() => handleSocialSignIn(p.id)}
                >
                  {p.icon}
                  {socialLoading === p.id ? "Redirecting\u2026" : p.label}
                </Button>
              ))}
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

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
                  disabled={anyLoading}
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
                    disabled={anyLoading}
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
              <Button type="submit" variant="default" className="w-full" disabled={anyLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              By signing in you agree to our terms
            </p>

            <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">
                Hiring for your organization?{" "}
                <Link href="/get-started" className="font-medium text-amber-600 hover:text-amber-500 transition-colors">
                  Get started here &rarr;
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
