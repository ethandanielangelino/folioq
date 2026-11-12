import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import MotionProvider from "@/app/components/motion/motion-provider";
import { SessionScript, SessionSync } from "@/app/components/session";
import { ThemeProvider } from "@/app/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The serif carries page titles and every written thesis.
const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "FolioQ",
  description: "Portfolio accountability for people managing money on behalf of others.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionScript />
        <SessionSync />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <MotionProvider>{children}</MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
