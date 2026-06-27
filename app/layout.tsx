import type { Metadata, Viewport } from "next";
import { Barlow, Geist } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "GigaChad Cloud",
  description: "Your private cloud for photos, videos and audio — fast, organised and secure.",
  applicationName: "GigaChad Cloud",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "GigaChad Cloud" },
  icons: {
    icon: "/gcc.svg",
    shortcut: "/gcc.svg",
    apple: "/gcc.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0c0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark", "h-full", "font-sans", geist.variable)} suppressHydrationWarning>
      <body className="app-shell antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
