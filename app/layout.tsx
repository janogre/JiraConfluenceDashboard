import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jira Confluence Dashboard",
  description: "Unified dashboard for Jira and Confluence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
