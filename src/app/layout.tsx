import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "New Kanban Task",
  description: "Quick-capture form for Vibe Kanban",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
