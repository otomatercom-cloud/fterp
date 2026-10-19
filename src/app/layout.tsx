import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = { title: "Interior ERP", description: "Interior Design & Manufacturing ERP on Odoo 19" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
