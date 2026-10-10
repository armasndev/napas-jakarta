export interface AboutSection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
}

export interface AboutContent {
  readonly intro: string;
  readonly sections: readonly AboutSection[];
  readonly guideLabel: string;
  readonly privacyLabel: string;
  readonly portalLabel: string;
}

export const ABOUT_CONTENT: Record<"en" | "id", AboutContent> = {
  en: {
    intro:
      "Napas Jakarta is a free, bilingual map and assistant that helps people read Jakarta's air-quality data. It shows readings from official monitoring stations and explains what they mean, in English and Bahasa Indonesia, with no account required.",
    sections: [
      {
        id: "who-its-for",
        heading: "Who is Napas Jakarta for?",
        paragraphs: [
          "Residents, commuters, parents, students and anyone who wants to understand a station reading instead of only seeing a number. It is built to answer practical questions: what a value means, how recent it is, where it came from, and what to check next.",
        ],
      },
      {
        id: "data-source",
        heading: "Where does the data come from?",
        paragraphs: [
          "Station observations come from the official DKI Jakarta air-quality monitoring portal. Each reading keeps its station name, observation time and a link back to the source so you can verify it. Napas does not operate monitors or measure air quality itself.",
          "The data is refreshed from the portal on a schedule, currently every hour. The observation time on each reading, not the refresh time, tells you when the air was measured.",
        ],
      },
      {
        id: "freshness",
        heading: "How does Napas handle old or missing readings?",
        paragraphs: [
          "A reading counts as current only if it was observed within the last 24 hours. Older readings are labelled stale and always show their observation time. Some stations stop reporting for days; they keep their last reading but are marked stale, and the summary counts only stations with a recent reading.",
          "A missing value is shown as unavailable, never as zero.",
        ],
      },
      {
        id: "assistant",
        heading: "How does the assistant answer questions?",
        paragraphs: [
          "The assistant answers from station data and curated official sources, such as government guidance and World Health Organization guidelines. It keeps a single station's reading separate from wider city context, shows the observation time and source, and cites sources where they are available. When the evidence is not there, it says so instead of guessing. It does not diagnose symptoms or give medical advice.",
        ],
      },
      {
        id: "limits",
        heading: "What can't Napas tell you?",
        bullets: [
          "A station reading describes that station and that time only. It is not a citywide average.",
          "ISPU and pollutant concentrations such as PM2.5 are different kinds of value. Napas does not silently convert between them.",
          "Historical charts are city-level modelled context, not official station history.",
          "WHO guideline values are health-based recommendations, not Indonesian legal thresholds.",
          "Napas is an educational information tool, not an official warning service or a medical device.",
        ],
      },
    ],
    guideLabel: "Read the Jakarta air quality guide",
    privacyLabel: "Privacy",
    portalLabel: "Official DKI Jakarta air-quality portal",
  },
  id: {
    intro:
      "Napas Jakarta adalah peta dan asisten dwibahasa gratis yang membantu orang memahami data kualitas udara Jakarta. Napas menampilkan pembacaan dari stasiun pemantau resmi dan menjelaskan artinya dalam bahasa Indonesia dan Inggris, tanpa perlu akun.",
    sections: [
      {
        id: "untuk-siapa",
        heading: "Untuk siapa Napas Jakarta?",
        paragraphs: [
          "Warga, pelaju, orang tua, pelajar, dan siapa pun yang ingin memahami pembacaan stasiun, bukan hanya melihat angka. Napas dibuat untuk menjawab pertanyaan praktis: apa arti suatu nilai, seberapa baru nilai itu, dari mana asalnya, dan apa yang perlu diperiksa berikutnya.",
        ],
      },
      {
        id: "sumber-data",
        heading: "Dari mana data berasal?",
        paragraphs: [
          "Pengamatan stasiun berasal dari portal pemantauan kualitas udara resmi DKI Jakarta. Setiap pembacaan menyimpan nama stasiun, waktu pengamatan, dan tautan ke sumbernya agar dapat Anda periksa sendiri. Napas tidak mengoperasikan monitor dan tidak mengukur kualitas udara sendiri.",
          "Data diperbarui dari portal secara terjadwal, saat ini setiap jam. Waktu pengamatan pada setiap pembacaan, bukan waktu pembaruan, menunjukkan kapan udara diukur.",
        ],
      },
      {
        id: "kesegaran",
        heading: "Bagaimana Napas menangani data lama atau kosong?",
        paragraphs: [
          "Pembacaan dianggap terkini hanya jika diamati dalam 24 jam terakhir. Pembacaan yang lebih lama diberi label usang dan selalu menampilkan waktu pengamatannya. Sebagian stasiun berhenti melaporkan selama beberapa hari; stasiun itu tetap menyimpan pembacaan terakhirnya tetapi ditandai usang, dan ringkasan hanya menghitung stasiun dengan pembacaan baru.",
          "Nilai yang hilang ditampilkan sebagai tidak tersedia, bukan nol.",
        ],
      },
      {
        id: "asisten",
        heading: "Bagaimana asisten menjawab pertanyaan?",
        paragraphs: [
          "Asisten menjawab berdasarkan data stasiun dan sumber resmi yang dikurasi, seperti panduan pemerintah dan pedoman Organisasi Kesehatan Dunia (WHO). Asisten memisahkan pembacaan satu stasiun dari konteks kota yang lebih luas, menampilkan waktu pengamatan dan sumber, serta mencantumkan sitasi bila tersedia. Jika buktinya tidak ada, asisten menyatakannya dan tidak menebak. Asisten tidak mendiagnosis gejala dan tidak memberi nasihat medis.",
        ],
      },
      {
        id: "batasan",
        heading: "Apa yang tidak dapat dijawab Napas?",
        bullets: [
          "Pembacaan stasiun hanya menggambarkan stasiun dan waktu itu. Nilai ini bukan rata-rata seluruh kota.",
          "ISPU dan konsentrasi polutan seperti PM2,5 adalah jenis nilai yang berbeda. Napas tidak mengonversi keduanya secara diam-diam.",
          "Grafik historis adalah konteks model tingkat kota, bukan riwayat stasiun resmi.",
          "Nilai pedoman WHO adalah rekomendasi berbasis kesehatan, bukan ambang batas hukum Indonesia.",
          "Napas adalah alat informasi edukatif, bukan layanan peringatan resmi atau perangkat medis.",
        ],
      },
    ],
    guideLabel: "Baca panduan kualitas udara Jakarta",
    privacyLabel: "Privasi",
    portalLabel: "Portal kualitas udara resmi DKI Jakarta",
  },
};
