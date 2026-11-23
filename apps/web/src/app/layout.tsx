import { THEME_INIT_SCRIPT, ThemeProvider, Toaster, TooltipProvider } from "@kanon/ui";
import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-kanon-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-kanon-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KANON 卡农 — 在噪音里，谱出自己的确定性",
  description: "面向长期主义者的美股投资逻辑操作系统：可证伪核心假设、三情景估值赔率与交易纪律。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static zero-flash theme bootstrap
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-dvh bg-canvas text-ink-primary antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={180}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
