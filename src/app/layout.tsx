import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import AIChat from "@/components/AIChat";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/AuthContext";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  // OM44 — matches the app's own ground so the iPhone status bar and the
  // page are the same colour in standalone mode, instead of a white band.
  themeColor: "#fafaf9", // stone-50
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Draw under the notch and the home indicator; the shell pads for both
  // with env(safe-area-inset-*).
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Max & Bron's Menu",
  description: "A digital recipe box for Max and Bron.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Max & Bron",
  },
  // OM44 — the manifest pointed at /icon-192x192.png and /icon-512x512.png and
  // NEITHER EXISTED (404 on the live site), so "Add to Home Screen" gave a
  // blurry screenshot instead of an icon. They exist now, and iOS reads
  // apple-touch-icon ahead of the manifest.
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} ${inter.variable} antialiased bg-stone-50 text-stone-900`}
      >
        <AuthProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
          <AIChat />
        </AuthProvider>
      </body>
    </html>
  );
}
