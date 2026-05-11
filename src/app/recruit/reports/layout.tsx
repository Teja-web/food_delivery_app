import "@/app/globals.css";

/**
 * Reports layout — minimal wrapper, no extra chrome.
 * The recruit layout already handles auth. Print styles hide sidebar/header.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-background print:overflow-visible">
      {children}
    </div>
  );
}
