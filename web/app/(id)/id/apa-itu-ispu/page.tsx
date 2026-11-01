import type { Metadata } from "next";
import { GuideLayout } from "@/app/_components/guide-layout";
import { JsonLd } from "@/app/_components/site-schema";
import { pageSchema, UPDATED_LABEL } from "@/lib/guide-content";
import { absoluteUrl, EN_ISPU_PATH, ID_ISPU_PATH } from "@/lib/site";
import styles from "@/app/_components/guide-layout.module.css";

const title = "Apa Itu ISPU? Kategori Indeks Kualitas Udara | Napas Jakarta";
const description =
  "ISPU adalah Indeks Standar Pencemar Udara Indonesia. Pelajari lima kategori ISPU, arti angkanya, dan cara memeriksa pembacaan stasiun di Jakarta.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl(ID_ISPU_PATH),
    languages: {
      en: absoluteUrl(EN_ISPU_PATH),
      "x-default": absoluteUrl(EN_ISPU_PATH),
      id: absoluteUrl(ID_ISPU_PATH),
    },
  },
  openGraph: { type: "article", locale: "id_ID", title, description, url: absoluteUrl(ID_ISPU_PATH) },
  twitter: { card: "summary", title, description },
};

const headline = "Apa itu ISPU? Kategori indeks kualitas udara Jakarta";

const CATEGORIES = [
  { range: "0 sampai 50", name: "Baik" },
  { range: "51 sampai 100", name: "Sedang" },
  { range: "101 sampai 200", name: "Tidak Sehat" },
  { range: "201 sampai 300", name: "Sangat Tidak Sehat" },
  { range: "Di atas 300", name: "Berbahaya" },
] as const;

export default function IspuGuideId() {
  return (
    <GuideLayout lang="id" localizedPaths={{ en: EN_ISPU_PATH, id: ID_ISPU_PATH }}>
      <JsonLd data={pageSchema("id", "WebPage", headline, description, ID_ISPU_PATH)} />
      <p className={styles.eyebrow}>Napas Jakarta · Penjelasan kualitas udara</p>
      <h1 className={styles.title}>{headline}</h1>
      <p className={styles.intro}>
        ISPU (Indeks Standar Pencemar Udara) adalah indeks standar pencemaran udara Indonesia. Indeks
        ini mengelompokkan kadar polutan yang diukur ke dalam lima kategori, dari Baik hingga
        Berbahaya. ISPU adalah indeks, bukan konsentrasi, sehingga angkanya tidak sama dengan PM2.5
        dalam µg/m³.
      </p>
      <p className={styles.updated}>{UPDATED_LABEL.id}</p>

      <section aria-labelledby="kategori" className={styles.section}>
        <h2 id="kategori">Apa saja lima kategori ISPU?</h2>
        <p>
          Rentang berikut mengikuti Peraturan Menteri Lingkungan Hidup dan Kehutanan P.14/2020
          tentang ISPU.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Nilai ISPU</th>
              <th scope="col">Kategori</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => (
              <tr key={category.name}>
                <td>{category.range}</td>
                <td>{category.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="bukan-pm25" className={styles.section}>
        <h2 id="bukan-pm25">Apakah ISPU sama dengan PM2.5?</h2>
        <p>
          Tidak. PM2.5 adalah konsentrasi partikel halus di udara, dilaporkan dalam µg/m³. ISPU
          adalah indeks tanpa satuan yang dihitung dari hasil pengukuran polutan. Jangan
          membandingkan nilai ISPU secara langsung dengan konsentrasi PM2.5.
        </p>
      </section>

      <section aria-labelledby="membaca-stasiun" className={styles.section}>
        <h2 id="membaca-stasiun">Bagaimana membaca pembacaan stasiun?</h2>
        <p>
          Periksa nama stasiun, waktu pengamatan, dan sumber datanya bersama-sama. Nilai ISPU
          menggambarkan stasiun yang melaporkannya pada waktu tersebut, bukan seluruh Jakarta.
        </p>
      </section>

      <section aria-labelledby="aqi-difference" className={styles.section}>
        <h2 id="aqi-difference">Apa bedanya dengan AQI?</h2>
        <p>
          AQI adalah indeks US EPA yang dipakai banyak aplikasi kualitas udara. Napas Jakarta menampilkan AQI PM2.5 yang dihitung sendiri di samping nilai ISPU resmi. Kedua indeks memakai skala dan batas kategori yang berbeda, jadi jangan membandingkannya secara langsung.
        </p>
      </section>

      <section aria-labelledby="verifikasi" className={styles.section}>
        <h2 id="verifikasi">Di mana saya dapat memeriksa data resmi?</h2>
        <p>
          Buka portal kualitas udara DKI Jakarta, lalu bandingkan stasiun dan waktu pembaruan yang
          tertera di sana. Peraturan ISPU diterbitkan oleh Kementerian Lingkungan Hidup dan
          Kehutanan.
        </p>
        <p>
          <a href="https://udara.jakarta.go.id/" rel="noreferrer" target="_blank">
            Portal kualitas udara DKI Jakarta (udara.jakarta.go.id)
          </a>
          {" · "}
          <a
            href="https://jdih.menlhk.go.id/new2/uploads/files/P_14_2020_ISPU_menlhk_07302020074834.pdf"
            rel="noreferrer"
            target="_blank"
          >
            Peraturan P.14/2020 tentang ISPU (PDF)
          </a>
        </p>
      </section>
    </GuideLayout>
  );
}
