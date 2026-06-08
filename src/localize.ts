import type { HomeAssistant } from "home-assistant-types";
import * as en from "./translations/en.json";
import * as nb from "./translations/nb.json";
import * as es from "./translations/es.json";

const languages: Record<string, unknown> = {
  en,
  nb,
  es
};

const DEFAULT_LANG = "en";

function getTranslatedString(key: string, lang: string): string | undefined {
  lang = languages[lang] ? lang : DEFAULT_LANG;

  const values = key.split(".");
  const translatedString = values.reduce(
    (prev, curr) => (prev as Record<string, unknown>)?.[curr], 
    languages[lang]
  );

  return translatedString as string | undefined;
}

const setupCustomlocalize = (hass?: HomeAssistant) => (key: string) => {
  const lang = hass?.locale.language ?? DEFAULT_LANG;
  const translated = getTranslatedString(key, lang) ?? hass?.localize(key);

  return translated ?? key;
}

export default setupCustomlocalize;