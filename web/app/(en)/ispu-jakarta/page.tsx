import type { Metadata } from "next";
import { GuideLayout } from "@/app/_components/guide-layout";
import { JsonLd } from "@/app/_components/site-schema";
import { pageSchema, UPDATED_LABEL } from "@/lib/guide-content";
import { absoluteUrl, EN_ISPU_PATH, ID_ISPU_PATH } from "@/lib/site";
import styles from "@/app/_components/guide-layout.module.css";

const title = "What Is ISPU? Air Quality Index Categories | Napas Jakarta";
const description =
  "ISPU is Indonesia's air pollution standard index. See the five ISPU categories, what the numbers mean, and how to check a Jakarta station reading.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl(EN_ISPU_PATH),
    languages: {
      en: absoluteUrl(EN_ISPU_PATH),
      "x-default": absoluteUrl(EN_ISPU_PATH),
      id: absoluteUrl(ID_ISPU_PATH),
    },
  },
  openGraph: { type: "article", locale: "en_ID", title, description, url: absoluteUrl(EN_ISPU_PATH) },
  twitter: { card: "summary", title, description },
};

const headline = "What is ISPU? Jakarta air quality index categories explained";

const CATEGORIES = [
  { range: "0 to 50", name: "Baik", english: "Good" },
  { range: "51 to 100", name: "Sedang", english: "Moderate" },
  { range: "101 to 200", name: "Tidak Sehat", english: "Unhealthy" },
  { range: "201 to 300", name: "Sangat Tidak Sehat", english: "Very unhealthy" },
  { range: "Above 300", name: "Berbahaya", english: "Hazardous" },
] as const;

export default function IspuGuideEn() {
  return (
    <GuideLayout lang="en" localizedPaths={{ en: EN_ISPU_PATH, id: ID_ISPU_PATH }}>
      <JsonLd data={pageSchema("en", "WebPage", headline, description, EN_ISPU_PATH)} />
      <p className={styles.eyebrow}>Napas Jakarta · Air quality explained</p>
      <h1 className={styles.title}>{headline}</h1>
      <p className={styles.intro}>
        ISPU (Indeks Standar Pencemar Udara) is Indonesia's air pollution standard index. It places
        measured pollutant levels into one of five categories, from Baik (good) to Berbahaya
        (hazardous). ISPU is an index, not a concentration, so it is not the same number as PM2.5
        in µg/m³.
      </p>
      <p className={styles.updated}>{UPDATED_LABEL.en}</p>

      <section aria-labelledby="categories" className={styles.section}>
        <h2 id="categories">What are the five ISPU categories?</h2>
        <p>
          The ranges below follow Ministry of Environment and Forestry Regulation P.14/2020 on the
          ISPU.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">ISPU value</th>
              <th scope="col">Category</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => (
              <tr key={category.name}>
                <td>{category.range}</td>
                <td>
                  {category.name} ({category.english})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="index-not-concentration" className={styles.section}>
        <h2 id="index-not-concentration">Is ISPU the same as PM2.5?</h2>
        <p>
          No. PM2.5 is the concentration of fine particles in the air, reported in µg/m³. ISPU is a
          unitless index derived from pollutant measurements. Do not compare an ISPU value directly
          with a PM2.5 concentration.
        </p>
      </section>

      <section aria-labelledby="read-a-station" className={styles.section}>
        <h2 id="read-a-station">How should I read a station reading?</h2>
        <p>
          Check the station name, the observation time and the source together. An ISPU value
          describes the station that reported it at that time, not the whole of Jakarta.
        </p>
      </section>

      <section aria-labelledby="aqi-difference" className={styles.section}>
        <h2 id="aqi-difference">How is this different from AQI?</h2>
        <p>
          AQI is the US EPA index, used by many air-quality apps. Napas Jakarta shows a derived PM2.5 AQI next to the official ISPU value. The two use different scales and category limits, so do not compare them directly.
        </p>
      </section>

      <section aria-labelledby="verify" className={styles.section}>
        <h2 id="verify">Where can I verify the official data?</h2>
        <p>
          Open the DKI Jakarta air-quality portal and compare the station and update time shown
          there. The ISPU regulation is published by the Ministry of Environment and Forestry.
        </p>
        <p>
          <a href="https://udara.jakarta.go.id/" rel="noreferrer" target="_blank">
            DKI Jakarta air-quality portal (udara.jakarta.go.id)
          </a>
          {" · "}
          <a
            href="https://jdih.menlhk.go.id/new2/uploads/files/P_14_2020_ISPU_menlhk_07302020074834.pdf"
            rel="noreferrer"
            target="_blank"
          >
            Ministry regulation P.14/2020 on ISPU (PDF)
          </a>
        </p>
      </section>
    </GuideLayout>
  );
}
