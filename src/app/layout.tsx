import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/config";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
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
        select: { themeMode: true },
      })
    : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} h-full antialiased`}
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
