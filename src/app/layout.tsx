import type { Metadata } from "next";
import "./globals.css";


const THEME_BOOT = `try{var t=localStorage.getItem("ierp-theme");if(t&&["maroon","day","ocean","emerald"].indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export const metadata: Metadata = { title: "Interior ERP", description: "Interior Design & Manufacturing ERP on Odoo 19" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
