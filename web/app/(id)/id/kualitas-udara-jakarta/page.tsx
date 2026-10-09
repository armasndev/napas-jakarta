import type { Metadata } from "next";
import { GuideLayout } from "@/app/_components/guide-layout";
import { JsonLd } from "@/app/_components/site-schema";
import { GUIDE_FAQS, guideSchema, UPDATED_LABEL } from "@/lib/guide-content";
import { absoluteUrl, EN_GUIDE_PATH, ID_GUIDE_PATH } from "@/lib/site";
import styles from "@/app/_components/guide-layout.module.css";

const title = "Kualitas Udara Jakarta: PM2.5, PM10 & ISPU | Napas Jakarta";
const description =
  "Panduan membaca kualitas udara Jakarta: arti PM2.5, PM10, dan ISPU, cara membaca waktu dan sumber pengamatan stasiun, serta tempat memeriksa data resmi.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl(ID_GUIDE_PATH),
    languages: {
      en: absoluteUrl(EN_GUIDE_PATH),
      "x-default": absoluteUrl(EN_GUIDE_PATH),
      id: absoluteUrl(ID_GUIDE_PATH),
    },
  },
  openGraph: { type: "article", locale: "id_ID", title, description, url: absoluteUrl(ID_GUIDE_PATH) },
  twitter: { card: "summary", title, description },
};

const headline = "Kualitas udara Jakarta: memahami PM2.5, PM10, dan ISPU";

export default function PanduanKualitasUdaraJakarta() {
  return (
    <GuideLayout lang="id">
      <JsonLd data={guideSchema("id", headline, description)} />
      <p className={styles.eyebrow}>Napas Jakarta · Memahami kualitas udara</p>
      <h1 className={styles.title}>{headline}</h1>
      <p className={styles.intro}>
        Kualitas udara Jakarta dipantau melalui stasiun di lokasi tertentu. PM2.5 dan PM10 adalah
        ukuran partikel, sedangkan ISPU adalah indeks kualitas udara tanpa satuan. Periksa nama
        stasiun, waktu pengamatan, dan sumber data secara bersamaan; satu angka stasiun tidak
        otomatis mewakili seluruh Jakarta.
      </p>
      <p className={styles.updated}>{UPDATED_LABEL.id}</p>

      <section aria-labelledby="tampilan-napas" className={styles.section}>
        <h2 id="tampilan-napas">Apa yang ditampilkan peta Napas Jakarta?</h2>
        <p>
          Napas Jakarta adalah peta dan asisten dwibahasa untuk memahami pengamatan kualitas udara
          per stasiun di Jakarta. Setiap hasil terkait dengan lokasi dan waktu tertentu. Saat
          membaca angka, periksa polutan, satuan, waktu pengamatan, dan tautan sumbernya.
        </p>
      </section>

      <section aria-labelledby="pm25-pm10" className={styles.section}>
        <h2 id="pm25-pm10">Apa perbedaan PM2.5 dan PM10?</h2>
        <p>
          PM2.5 adalah partikel di udara dengan diameter aerodinamis 2,5 mikrometer atau lebih
          kecil. PM10 adalah partikel dengan diameter 10 mikrometer atau lebih kecil. Jika
          ditampilkan dalam µg/m³, nilainya merupakan konsentrasi polutan, bukan indeks kualitas
          udara.
        </p>
      </section>

      <section aria-labelledby="ispu" className={styles.section}>
        <h2 id="ispu">Apa arti ISPU Jakarta?</h2>
        <p>
          ISPU (Indeks Standar Pencemar Udara) adalah indeks tanpa satuan yang menggambarkan mutu
          udara ambien di lokasi tertentu. ISPU berbeda dari konsentrasi polutan seperti PM2.5
          dalam µg/m³. Angka ISPU tidak boleh dibaca sebagai konsentrasi.
        </p>
      </section>

      <section aria-labelledby="aqi-vs-ispu" className={styles.section}>
        <h2 id="aqi-vs-ispu">Apa beda AQI dengan ISPU?</h2>
        <p>
          AQI (Air Quality Index) adalah indeks Badan Perlindungan Lingkungan Amerika Serikat (US EPA). Napas Jakarta juga menampilkan AQI PM2.5, yang dihitung dari rata-rata 24 jam pembacaan PM2.5 suatu stasiun dengan metode EPA, karena skala ini banyak dikenal. Napas yang menghitung angka ini, bukan Pemerintah DKI Jakarta. Nilai resmi Jakarta adalah ISPU. Kedua indeks mengubah kadar polutan menjadi angka, tetapi skala dan batas kategorinya berbeda, jadi jangan membandingkannya secara langsung. Sebuah stasiun hanya menampilkan AQI jika memiliki sedikitnya 18 pembacaan per jam dalam 24 jam terakhir.
        </p>
      </section>

      <section aria-labelledby="cek-terkini" className={styles.section}>
        <h2 id="cek-terkini">Bagaimana cara memeriksa kualitas udara Jakarta terkini?</h2>
        <p>
          Periksa nama stasiun dan waktu pembaruan, lalu ikuti tautan sumber untuk melihat catatan
          resmi. Portal pemantauan DKI Jakarta menyediakan informasi per stasiun. Napas Jakarta
          membantu memberi konteks melalui peta dan penjelasan; gunakan waktu pada sumber data
          untuk menilai apakah pengamatan masih terkini.
        </p>
      </section>

      <section aria-labelledby="pertanyaan" className={styles.section}>
        <h2 id="pertanyaan">Pertanyaan umum tentang kualitas udara Jakarta</h2>
        {GUIDE_FAQS.id.map((faq) => (
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

      <section aria-labelledby="sumber" className={styles.section}>
        <h2 id="sumber">Sumber</h2>
        <ul className={styles.sources}>
          <li>
            <a href="https://udara.jakarta.go.id/parameter-pengukuran" rel="noreferrer" target="_blank">
              DKI Jakarta: parameter pengukuran kualitas udara
            </a>
          </li>
          <li>
            <a href="https://jdih.menlhk.go.id/new2/uploads/files/P_14_2020_ISPU_menlhk_07302020074834.pdf" rel="noreferrer" target="_blank">
              Kementerian Lingkungan Hidup dan Kehutanan: peraturan ISPU (PDF)
            </a>
          </li>
          <li>
            <a href="https://www.who.int/news-room/feature-stories/detail/what-are-the-who-air-quality-guidelines" rel="noreferrer" target="_blank">
              Organisasi Kesehatan Dunia: definisi ukuran partikel
            </a>
          </li>
        </ul>
      </section>
    </GuideLayout>
  );
}
