import type { ReactNode } from "react";
import Link from "next/link";
import { EN_ABOUT_PATH, EN_GUIDE_PATH, ID_ABOUT_PATH, ID_GUIDE_PATH } from "@/lib/site";
import { SiteHeader } from "./site-header";
import styles from "./guide-layout.module.css";

export function GuideLayout({
  lang,
  localizedPaths = { en: EN_GUIDE_PATH, id: ID_GUIDE_PATH },
  children,
}: {
  readonly lang: "en" | "id";
  readonly localizedPaths?: { readonly en: string; readonly id: string };
  readonly children: ReactNode;
}) {
  const isEnglish = lang === "en";

  return (
    <main className={styles.page}>
      <SiteHeader language={lang} localizedPaths={localizedPaths} />
      <article className={styles.article} lang={lang}>
        {children}
        <nav aria-label={isEnglish ? "Related pages" : "Halaman terkait"} className={styles.related}>
          <Link href="/">
            {isEnglish ? "Open the Napas Jakarta workspace" : "Buka ruang kerja Napas Jakarta"}
          </Link>
          <Link href={isEnglish ? EN_ABOUT_PATH : ID_ABOUT_PATH} lang={lang}>
            {isEnglish ? "How Napas Jakarta sources and checks its data" : "Cara Napas Jakarta memperoleh dan memeriksa datanya"}
          </Link>
          <Link href={isEnglish ? ID_GUIDE_PATH : EN_GUIDE_PATH} lang={isEnglish ? "id" : "en"}>
            {isEnglish ? "Baca dalam Bahasa Indonesia" : "Read in English"}
          </Link>
        </nav>
      </article>
      <footer className={styles.footer}>
        {isEnglish
          ? "Napas Jakarta explains station-level air-quality information. Check each reading's time and source before using it."
          : "Napas Jakarta menjelaskan informasi kualitas udara per stasiun. Periksa waktu dan sumber setiap pengamatan sebelum menggunakannya."}
      </footer>
    </main>
  );
}
