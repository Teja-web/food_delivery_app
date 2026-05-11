"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle, UserPlus, Mail, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAccountForInvitation, setActiveOrgAfterInvitation } from "@/actions/members";
import { authClient } from "@/lib/auth-client";

interface Props {
  invitationId: string;
  email: string;
  organizationName: string;
  inviterName: string;
  userExists: boolean;
}

export function AcceptInvitationClient({ invitationId, email, organizationName, inviterName, userExists }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"form" | "submitting" | "accepting" | "success">("form");
  const [formError, setFormError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signup" | "signin">(userExists ? "signin" : "signup");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // If the user is already logged in, try to accept directly
  const handleAcceptAsExistingUser = async () => {
    setStatus("accepting");
    try {
      const result = await authClient.organization.acceptInvitation({ invitationId });
      if (result.error) {
        setFormError(result.error.message || "Failed to accept invitation");
        setStatus("form");
        return;
      }
      await setActiveOrgAfterInvitation(invitationId);
      setStatus("success");
      setTimeout(() => {
        router.push("/recruit");
        router.refresh();
      }, 1500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to accept invitation");
      setStatus("form");
    }
  };

  // Handle sign-in for existing users
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!password) {
      setFormError("Please enter your password");
      return;
    }

    setStatus("submitting");

    try {
      const signInResult = await authClient.signIn.email({ email, password });

      if (signInResult.error) {
        setFormError(signInResult.error.message || "Invalid password. Please try again.");
        setStatus("form");
        return;
      }

      setStatus("accepting");

      const acceptResult = await authClient.organization.acceptInvitation({ invitationId });

      if (acceptResult.error) {
        setFormError(acceptResult.error.message || "Failed to accept invitation");
        setStatus("form");
        return;
      }

      await setActiveOrgAfterInvitation(invitationId);
      setStatus("success");

      setTimeout(() => {
        router.push("/recruit");
        router.refresh();
      }, 1500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStatus("form");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Please enter your name");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    setStatus("submitting");

    try {
      const createResult = await createAccountForInvitation({
        name: name.trim(),
        email,
        password,
      });

      if (!createResult.success) {
        setFormError(createResult.error || "Failed to create account");
        setStatus("form");
        return;
      }

      const signInResult = await authClient.signIn.email({ email, password });

      if (signInResult.error) {
        setFormError(signInResult.error.message || "Failed to sign in");
        setStatus("form");
        return;
      }

      const acceptResult = await authClient.organization.acceptInvitation({ invitationId });

      if (acceptResult.error) {
        setFormError(acceptResult.error.message || "Failed to accept invitation");
        setStatus("form");
        return;
      }

      await setActiveOrgAfterInvitation(invitationId);
      setStatus("success");

      setTimeout(() => {
        router.push("/recruit");
        router.refresh();
      }, 1500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStatus("form");
    }
  };

  if (status === "submitting" || status === "accepting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">
            {status === "submitting" ? "Creating your account..." : "Accepting invitation..."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-semibold">Welcome to the team!</h1>
          <p className="text-muted-foreground">
            Your account has been created. Redirecting you to the app...
          </p>
        </div>
      </div>
    );
  }

  // Sign-in form for existing users
  if (mode === "signin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Join {organizationName}</CardTitle>
                <CardDescription className="mt-2">
                  <span className="font-medium">{inviterName}</span> has invited you to join their organization.
                  Sign in to accept the invitation.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignIn} className="space-y-4">
                {formError && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    {formError}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" value={email} disabled className="pl-10 bg-muted" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="current-password" />
                </div>

                <Button type="submit" variant="default" className="w-full" size="lg">
                  <Building2 className="h-4 w-4 mr-2" />
                  Sign In &amp; Join {organizationName}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => setMode("signup")}
                    className="font-medium"
                  >
                    Create one instead
                  </Button>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Signup form for new users
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <UserPlus className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">Join {organizationName}</CardTitle>
              <CardDescription className="mt-2">
                <span className="font-medium">{inviterName}</span> has invited you to join their organization.
                Create your account to get started.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" value={email} disabled className="pl-10 bg-muted" />
                </div>
                <p className="text-xs text-muted-foreground">
                  This is the email address the invitation was sent to
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input id="name" type="text" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
              </div>

              <Button type="submit" variant="default" className="w-full" size="lg">
                <Building2 className="h-4 w-4 mr-2" />
                Join {organizationName}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Already have an account?{" "}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setMode("signin")}
                  className="font-medium"
                >
                  Sign in instead
                </Button>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
