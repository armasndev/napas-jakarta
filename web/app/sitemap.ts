import type { MetadataRoute } from "next";
import { ABOUT_DATE_MODIFIED, GUIDE_DATE_MODIFIED, ISPU_DATE_MODIFIED } from "@/lib/guide-content";
import {
  absoluteUrl,
  EN_ABOUT_PATH,
  EN_GUIDE_PATH,
  EN_HOME_PATH,
  EN_PRIVACY_PATH,
  ID_ABOUT_PATH,
  ID_GUIDE_PATH,
  ID_HOME_PATH,
  EN_ISPU_PATH,
  ID_ISPU_PATH,
  ID_PRIVACY_PATH,
} from "@/lib/site";

// Language alternates (hreflang) live in each page's <link rel="alternate">
// metadata, which Google accepts on its own. Keeping them out of the sitemap
// leaves a plain sitemap that browsers show as an XML tree and avoids two
// places that must stay in agreement.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl(EN_HOME_PATH) },
    { url: absoluteUrl(ID_HOME_PATH) },
    { url: absoluteUrl(EN_ABOUT_PATH), lastModified: ABOUT_DATE_MODIFIED },
    { url: absoluteUrl(ID_ABOUT_PATH), lastModified: ABOUT_DATE_MODIFIED },
    { url: absoluteUrl(EN_ISPU_PATH), lastModified: ISPU_DATE_MODIFIED },
    { url: absoluteUrl(ID_ISPU_PATH), lastModified: ISPU_DATE_MODIFIED },
    { url: absoluteUrl(EN_PRIVACY_PATH) },
    { url: absoluteUrl(ID_PRIVACY_PATH) },
    { url: absoluteUrl(EN_GUIDE_PATH), lastModified: GUIDE_DATE_MODIFIED },
    { url: absoluteUrl(ID_GUIDE_PATH), lastModified: GUIDE_DATE_MODIFIED },
  ];
}
