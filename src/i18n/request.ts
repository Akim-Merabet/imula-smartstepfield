import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from "./config";
import { loadMessages } from "./load-messages";

function pick(value: string | undefined | null): Locale | undefined {
  if (!value) return undefined;
  const short = value.slice(0, 2).toLowerCase();
  return (locales as readonly string[]).includes(short) ? (short as Locale) : undefined;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale =
    pick(store.get(LOCALE_COOKIE)?.value) ??
    pick((await headers()).get("accept-language")) ??
    defaultLocale;

  return {
    locale,
    timeZone: "Europe/Paris",
    messages: await loadMessages(locale),
  };
});
