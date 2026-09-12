import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/config";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Personal budget tracker",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { accentColor: true, themeMode: true },
      })
    : null;

  return (
    <html
      lang="en"
      data-accent={user?.accentColor ?? "coral"}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme={user?.themeMode ?? "system"} enableSystem>
          <SessionProvider>{children}</SessionProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
