import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/app-config";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("global");
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("appDescription"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${roboto.variable} h-full antialiased`}>
      <body className="h-full">
        <NextIntlClientProvider>
          <NuqsAdapter>
            <TooltipProvider delayDuration={300}>
              {children}
              <Toaster position="top-right" duration={5000} closeButton richColors />
            </TooltipProvider>
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
