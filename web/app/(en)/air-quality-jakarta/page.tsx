import type { Metadata } from "next";
import { GuideLayout } from "@/app/_components/guide-layout";
import { JsonLd } from "@/app/_components/site-schema";
import { GUIDE_FAQS, guideSchema, UPDATED_LABEL } from "@/lib/guide-content";
import { absoluteUrl, EN_GUIDE_PATH, ID_GUIDE_PATH } from "@/lib/site";
import styles from "@/app/_components/guide-layout.module.css";

const title = "Jakarta Air Quality: PM2.5, PM10 & ISPU | Napas Jakarta";
const description =
  "A clear guide to Jakarta air-quality readings: what PM2.5, PM10 and ISPU mean, how to read station timestamps and sources, and where to verify official data.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl(EN_GUIDE_PATH),
    languages: {
      en: absoluteUrl(EN_GUIDE_PATH),
      "x-default": absoluteUrl(EN_GUIDE_PATH),
      id: absoluteUrl(ID_GUIDE_PATH),
    },
  },
  openGraph: { type: "article", locale: "en_ID", title, description, url: absoluteUrl(EN_GUIDE_PATH) },
  twitter: { card: "summary", title, description },
};

const headline = "Jakarta air quality: PM2.5, PM10 and ISPU explained";

export default function JakartaAirQualityGuide() {
  return (
    <GuideLayout lang="en">
      <JsonLd data={guideSchema("en", headline, description)} />
      <p className={styles.eyebrow}>Napas Jakarta · Air quality explained</p>
      <h1 className={styles.title}>{headline}</h1>
      <p className={styles.intro}>
        Jakarta air quality is measured at individual monitoring stations. PM2.5 and PM10 are
        particle measurements; ISPU is Indonesia's unitless air-quality index. Check the station,
        observation time and source together: one station reading is not automatically a
        city-wide average.
      </p>
      <p className={styles.updated}>{UPDATED_LABEL.en}</p>

      <section aria-labelledby="what-napas-shows" className={styles.section}>
        <h2 id="what-napas-shows">What does the Napas Jakarta map show?</h2>
        <p>
          Napas Jakarta is a bilingual map and assistant for understanding Jakarta station
          observations. A reading belongs to a particular monitor and time. Read its pollutant,
          unit, timestamp and source link together, especially when comparing different locations.
        </p>
      </section>

      <section aria-labelledby="pm25-pm10" className={styles.section}>
        <h2 id="pm25-pm10">What is the difference between PM2.5 and PM10?</h2>
        <p>
          PM2.5 describes airborne particles with an aerodynamic diameter of 2.5 micrometres or
          less. PM10 describes particles of 10 micrometres or less. When shown in µg/m³, each is a
          pollutant concentration; the two measurements are not an air-quality index.
        </p>
      </section>

      <section aria-labelledby="what-is-ispu" className={styles.section}>
        <h2 id="what-is-ispu">What is ISPU in Jakarta?</h2>
        <p>
          ISPU (Indeks Standar Pencemar Udara) is Indonesia's dimensionless index describing
          ambient air quality at a particular location. It is a different kind of value from a
          pollutant concentration such as PM2.5 in µg/m³. Do not read an ISPU number as a
          concentration.
        </p>
      </section>

      <section aria-labelledby="aqi-vs-ispu" className={styles.section}>
        <h2 id="aqi-vs-ispu">How does AQI compare with ISPU?</h2>
        <p>
          AQI, the Air Quality Index, is the index of the US Environmental Protection Agency. Napas Jakarta also shows a PM2.5 AQI, calculated from the last 24 hours of a station's PM2.5 readings with the EPA method, because many people know that scale. Napas derives this number. It is not published by the Jakarta government, and the official Jakarta value is ISPU. Both indexes turn pollutant levels into a number, but their scales and category limits differ, so do not compare them directly. A station shows an AQI only when it has at least 18 hourly readings in the last 24 hours.
        </p>
      </section>

      <section aria-labelledby="check-current" className={styles.section}>
        <h2 id="check-current">How can I check current air quality in Jakarta?</h2>
        <p>
          Check the station name and latest observation time, then follow the source link for the
          official reading. The DKI Jakarta monitoring portal publishes current station
          information. Napas Jakarta adds map and explanation context; use the timestamp shown by
          the data source when deciding whether a reading is current.
        </p>
      </section>

      <section aria-labelledby="questions" className={styles.section}>
        <h2 id="questions">Common questions about Jakarta air quality</h2>
        {GUIDE_FAQS.en.map((faq) => (
          <div key={faq.question}>
            <h3>{faq.question}</h3>
            <p>
              {faq.answer}
              {faq.source ? (
                <>
                  {" "}
                  <a href={faq.source.href} rel="noreferrer" target="_blank">{faq.source.label}</a>
                </>
              ) : null}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="sources" className={styles.section}>
        <h2 id="sources">Sources</h2>
        <ul className={styles.sources}>
          <li>
            <a href="https://udara.jakarta.go.id/parameter-pengukuran" rel="noreferrer" target="_blank">
              DKI Jakarta: measured air-quality parameters
            </a>
          </li>
          <li>
            <a href="https://jdih.menlhk.go.id/new2/uploads/files/P_14_2020_ISPU_menlhk_07302020074834.pdf" rel="noreferrer" target="_blank">
              Indonesia Ministry of Environment and Forestry: ISPU regulation (PDF)
            </a>
          </li>
          <li>
            <a href="https://www.who.int/news-room/feature-stories/detail/what-are-the-who-air-quality-guidelines" rel="noreferrer" target="_blank">
              World Health Organization: particulate-matter size definitions
            </a>
          </li>
        </ul>
      </section>
    </GuideLayout>
  );
}
