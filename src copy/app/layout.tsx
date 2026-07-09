import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coznt",
  description: "AIDLC Governed. The trust ledger for AI-augmented engineering organizations.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
