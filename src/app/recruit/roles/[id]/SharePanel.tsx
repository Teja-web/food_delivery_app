"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { X, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { generateRoleSocialPosts } from "@/actions/roles";
import type { RoleSocialPosts } from "@/automations/agents/definitions/role-social-posts";
import { Button } from "@/components/ui/button";

interface SharePanelProps {
  roleId: string;
  roleTitle: string;
  onClose: () => void;
}

export function SharePanel({ roleId, roleTitle, onClose }: SharePanelProps) {
  const [generating, setGenerating] = useState(false);
  const [posts, setPosts] = useState<RoleSocialPosts | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const hasGenerated = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await generateRoleSocialPosts(roleId);
      setPosts(data);
    } catch {
      toast.error("Failed to generate social posts");
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate on first open
  useEffect(() => {
    if (!hasGenerated.current) {
      hasGenerated.current = true;
      handleGenerate();
    }
  }, []);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        className="fixed inset-4 bg-background border rounded-xl shadow-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-w-2xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold">Share Role</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate social media posts for &ldquo;{roleTitle}&rdquo;
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {generating && !posts && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Generating posts...</span>
            </div>
          )}

          {posts && (
            <>
              {/* LinkedIn */}
              <div className="rounded-xl border bg-card">
                <div className="border-b px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 text-[#0A66C2]" fill="currentColor" viewBox="-5.5 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0 8.219v15.563c0 1.469 1.156 2.625 2.625 2.625h15.563c0.719 0 1.406-0.344 1.844-0.781 0.469-0.469 0.781-1.063 0.781-1.844v-15.563c0-1.469-1.156-2.625-2.625-2.625h-15.563c-0.781 0-1.375 0.313-1.844 0.781-0.438 0.438-0.781 1.125-0.781 1.844zM2.813 10.281c0-1 0.813-1.875 1.813-1.875 1.031 0 1.875 0.875 1.875 1.875 0 1.031-0.844 1.844-1.875 1.844-1 0-1.813-0.813-1.813-1.844zM7.844 23.125v-9.531c0-0.219 0.219-0.406 0.375-0.406h2.656c0.375 0 0.375 0.438 0.375 0.719 0.75-0.75 1.719-0.938 2.719-0.938 2.438 0 4 1.156 4 3.719v6.438c0 0.219-0.188 0.406-0.375 0.406h-2.75c-0.219 0-0.375-0.219-0.375-0.406v-5.813c0-0.969-0.281-1.5-1.375-1.5-1.375 0-1.719 0.906-1.719 2.125v5.188c0 0.219-0.219 0.406-0.438 0.406h-2.719c-0.156 0-0.375-0.219-0.375-0.406zM2.875 23.125v-9.531c0-0.219 0.219-0.406 0.375-0.406h2.719c0.25 0 0.406 0.156 0.406 0.406v9.531c0 0.219-0.188 0.406-0.406 0.406h-2.719c-0.188 0-0.375-0.219-0.375-0.406z" /></svg>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn</span>
                  </div>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    onClick={() => handleCopy(posts.linkedin, "linkedin")}
                  >
                    {copiedField === "linkedin" ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy
                  </Button>
                </div>
                <div className="p-4">
                  <p className="text-sm whitespace-pre-wrap">{posts.linkedin}</p>
                </div>
              </div>

              {/* Twitter */}
              <div className="rounded-xl border bg-card">
                <div className="border-b px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Twitter / X</span>
                  </div>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    onClick={() => handleCopy(posts.twitter, "twitter")}
                  >
                    {copiedField === "twitter" ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy
                  </Button>
                </div>
                <div className="p-4">
                  <p className="text-sm whitespace-pre-wrap">{posts.twitter}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {posts.twitter.length}/280 characters
                  </p>
                </div>
              </div>

              {/* Regenerate */}
              <Button
                variant="soft"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Regenerate
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
