"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ReportShellProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  generatedAt?: string;
  children: React.ReactNode;
}

export function ReportShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  generatedAt,
  children,
}: ReportShellProps) {
  return (
    <div className="report-page">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-6 py-3 print:hidden">
        <div>
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          )}
        </div>
        <Button
          variant="soft"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          <Printer className="h-3.5 w-3.5" />
          Print / Save PDF
        </Button>
      </div>

      {/* Report content */}
      <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        {/* Print header — visible only when printing */}
        <div className="hidden print:block print:mb-6">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {generatedAt && (
            <p className="text-xs text-muted-foreground mt-1">Generated: {generatedAt}</p>
          )}
        </div>

        {/* Screen header */}
        <div className="mb-8 print:hidden">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>

        {children}

        {/* Print footer */}
        {generatedAt && (
          <p className="text-xs text-muted-foreground text-center pt-6 mt-8 border-t print:mt-4 print:pt-4">
            Report generated on {generatedAt}
          </p>
        )}
      </div>

      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0.6in;
            size: A4;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 11px;
          }
          .report-page {
            overflow: visible !important;
          }
          /* Prevent breaking inside cards */
          .report-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Section headings stay with content */
          h3 {
            break-after: avoid;
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
}
