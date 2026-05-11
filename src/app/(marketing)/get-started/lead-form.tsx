"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowRight, Building2, Mail, User, Users, MessageSquare, CheckCircle2, Loader2 } from "lucide-react";
import { submitLead } from "@/actions/leads";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

function useRecaptcha() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;
    if (document.querySelector(`script[src*="recaptcha"]`)) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!RECAPTCHA_SITE_KEY || !ready) return null;
    try {
      const grecaptcha = (window as any).grecaptcha;
      await new Promise<void>((resolve) => grecaptcha.ready(resolve));
      return await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "submit_lead" });
    } catch {
      return null;
    }
  }, [ready]);

  return { getToken };
}

export function LeadForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { getToken } = useRecaptcha();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    // Extract form data before async operations (React synthetic events are nullified after handler completes)
    const form = e.currentTarget;
    const formData = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      company: (form.elements.namedItem("company") as HTMLInputElement).value,
      teamSize: (form.elements.namedItem("teamSize") as HTMLSelectElement).value,
      needs: (form.elements.namedItem("needs") as HTMLTextAreaElement).value,
    };

    const recaptchaToken = await getToken();

    const result = await submitLead({
      ...formData,
      recaptchaToken: recaptchaToken || undefined,
    });

    if (result.ok) {
      setStatus("success");
    } else {
      setErrorMsg(result.error || "Something went wrong. Please try again or email us directly.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-xl p-6 lg:p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="font-display text-2xl text-white mb-3">We&rsquo;ll be in touch</h2>
        <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
          Thanks for your interest. We&rsquo;ll reach out within one business
          day to get your workspace set up.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-xl p-6 lg:p-8 space-y-5"
    >
      {errorMsg && (
        <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Name */}
      <div>
        <Label htmlFor="name" className="block text-xs font-medium text-slate-300 mb-1.5">
          Full name
        </Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Jane Smith"
            disabled={status === "submitting"}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <Label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1.5">
          Work email
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="jane@company.com"
            disabled={status === "submitting"}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Company */}
      <div>
        <Label htmlFor="company" className="block text-xs font-medium text-slate-300 mb-1.5">
          Company name
        </Label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            id="company"
            name="company"
            type="text"
            required
            placeholder="Acme Inc."
            disabled={status === "submitting"}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Team size */}
      <div>
        <Label htmlFor="teamSize" className="block text-xs font-medium text-slate-300 mb-1.5">
          Hiring team size
        </Label>
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <select
            id="teamSize"
            name="teamSize"
            required
            defaultValue=""
            disabled={status === "submitting"}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-4 py-3 text-sm text-white appearance-none focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-colors [&>option]:bg-slate-900 [&>option]:text-white disabled:opacity-50"
          >
            <option value="" disabled className="text-slate-600">Select team size</option>
            <option value="1-5">1 – 5 people</option>
            <option value="6-20">6 – 20 people</option>
            <option value="21-50">21 – 50 people</option>
            <option value="51-200">51 – 200 people</option>
            <option value="200+">200+ people</option>
          </select>
        </div>
      </div>

      {/* Needs */}
      <div>
        <Label htmlFor="needs" className="block text-xs font-medium text-slate-300 mb-1.5">
          What are you looking for?
        </Label>
        <div className="relative">
          <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <Textarea
            id="needs"
            name="needs"
            rows={3}
            placeholder="Tell us about your hiring challenges, volume, or what caught your eye..."
            disabled={status === "submitting"}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-colors resize-none disabled:opacity-50"
          />
        </div>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        variant="unstyled"
        disabled={status === "submitting"}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-amber-400 text-slate-950 font-semibold text-sm tracking-wide hover:bg-amber-300 transition-all cursor-pointer rounded-lg group disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            Request access
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </>
        )}
      </Button>

      <p className="text-xs text-slate-500 text-center">
        No credit card required. We&rsquo;ll respond within one business day.
      </p>
    </form>
  );
}
