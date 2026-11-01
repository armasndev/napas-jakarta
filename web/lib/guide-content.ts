import { absoluteUrl, EN_GUIDE_PATH, ID_GUIDE_PATH, SITE_NAME, SITE_URL } from "@/lib/site";

export const GUIDE_DATE_PUBLISHED = "2026-09-28";
export const GUIDE_DATE_MODIFIED = "2026-09-30";
export const ABOUT_DATE_MODIFIED = "2026-10-01";
export const ISPU_DATE_MODIFIED = "2026-10-09";

export type GuideLanguage = "en" | "id";

export interface GuideFaq {
  readonly question: string;
  readonly answer: string;
  readonly source?: { readonly label: string; readonly href: string };
}

const PORTAL = { label: "udara.jakarta.go.id", href: "https://udara.jakarta.go.id/" } as const;

export const GUIDE_FAQS: Record<GuideLanguage, readonly GuideFaq[]> = {
  en: [
    {
      question: "Can one air-quality station represent all of Jakarta?",
      answer:
        "No. A monitor records conditions at its own location and time. Compare multiple stations and their timestamps before drawing conclusions about a wider area.",
    },
    {
      question: "Are PM2.5 and ISPU the same?",
      answer:
        "No. PM2.5 is a particle concentration, commonly reported in µg/m³. ISPU is a unitless Indonesian index based on pollutant information.",
    },
    {
      question: "Where can I verify an official Jakarta station reading?",
      answer: "Open the DKI Jakarta air-quality portal and check the station and update time shown there.",
      source: PORTAL,
    },
  ],
  id: [
    {
      question: "Apakah satu stasiun mewakili seluruh Jakarta?",
      answer:
        "Tidak. Monitor mencatat kondisi di lokasi dan waktu pengukurannya sendiri. Bandingkan beberapa stasiun beserta waktu pengamatannya sebelum menarik kesimpulan untuk wilayah yang lebih luas.",
    },
    {
      question: "Apakah PM2.5 sama dengan ISPU?",
      answer:
        "Tidak. PM2.5 adalah konsentrasi partikel, biasanya dilaporkan dalam µg/m³. ISPU adalah indeks tanpa satuan yang dihitung dari informasi polutan.",
    },
    {
      question: "Di mana saya dapat memeriksa data stasiun resmi Jakarta?",
      answer: "Buka portal kualitas udara DKI Jakarta, lalu periksa stasiun dan waktu pembaruannya.",
      source: PORTAL,
    },
  ],
};

export const UPDATED_LABEL: Record<GuideLanguage, string> = {
  en: "Last updated 30 September 2026",
  id: "Terakhir diperbarui 30 September 2026",
};

const GUIDE_SOURCE_URLS = [
  "https://udara.jakarta.go.id/parameter-pengukuran",
  "https://jdih.menlhk.go.id/new2/uploads/files/P_14_2020_ISPU_menlhk_07302020074834.pdf",
  "https://www.who.int/news-room/feature-stories/detail/what-are-the-who-air-quality-guidelines",
];

const ORG_ID = `${SITE_URL}/#organization`;

export function guideSchema(lang: GuideLanguage, headline: string, description: string) {
  const path = lang === "id" ? ID_GUIDE_PATH : EN_GUIDE_PATH;
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline,
        description,
        url,
        mainEntityOfPage: url,
        inLanguage: lang,
        datePublished: GUIDE_DATE_PUBLISHED,
        dateModified: GUIDE_DATE_MODIFIED,
        author: { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
        isPartOf: { "@id": `${SITE_URL}/#website` },
        citation: GUIDE_SOURCE_URLS,
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: lang,
        mainEntity: GUIDE_FAQS[lang].map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.source ? `${faq.answer} ${faq.source.label}` : faq.answer,
          },
        })),
      },
      breadcrumbSchema(lang, headline, url),
    ],
  };
}

export function pageSchema(
  lang: GuideLanguage,
  type: "AboutPage" | "WebPage",
  name: string,
  description: string,
  path: string,
) {
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": type,
        "@id": `${url}#webpage`,
        name,
        description,
        url,
        inLanguage: lang,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      breadcrumbSchema(lang, name, url),
    ],
  };
}

function breadcrumbSchema(lang: GuideLanguage, name: string, url: string) {
  const home = lang === "id" ? absoluteUrl("/id") : absoluteUrl("/");
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: home },
      { "@type": "ListItem", position: 2, name, item: url },
    ],
  };
}

export function homeSchema(lang: GuideLanguage) {
  const url = lang === "id" ? absoluteUrl("/id") : absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${url}#application`,
    name: SITE_NAME,
    url,
    inLanguage: lang,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web browser",
    isAccessibleForFree: true,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": ORG_ID },
    description:
      lang === "id"
        ? "Jelajahi pembacaan kualitas udara per stasiun di Jakarta dan tanyakan tentang pengukuran polutan dan ISPU."
        : "Explore Jakarta station-level air-quality information and ask questions about pollutant measurements and ISPU.",
    citation: "https://udara.jakarta.go.id/",
  };
}
