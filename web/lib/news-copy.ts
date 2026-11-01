import type { Language } from "./i18n";
import type { ChipKind, NewsTopic } from "./news";

type Copy = {
  readonly panel: { readonly label: string; readonly news: string; readonly map: string; readonly timeline: string; readonly close: string };
  readonly news: {
    readonly sources: string;
    readonly all: string;
    readonly topics: Readonly<Record<NewsTopic, string>>;
    readonly loading: string;
    readonly error: string;
    readonly empty: string;
    readonly emptyFilter: string;
    readonly showAll: string;
    readonly dragHint: string;
    readonly add: string;
    readonly inChat: string;
    readonly opensNewTab: string;
    readonly demo: string;
    readonly articles: (count: number) => string;
  };
  readonly timeline: {
    readonly heading: string;
    readonly note: string;
    readonly empty: string;
    readonly error: string;
    readonly demo: string;
    readonly sources: (count: number) => string;
  };
  readonly chips: {
    readonly kinds: Readonly<Record<ChipKind, string>>;
    readonly trayLabel: string;
    readonly count: (count: number) => string;
    readonly limit: string;
    readonly added: (count: number) => string;
    readonly duplicate: string;
    readonly remove: (title: string) => string;
    readonly removed: (title: string) => string;
    readonly drop: string;
    readonly addPin: string;
    readonly pinAdded: string;
    readonly unavailable: string;
    readonly placeholder: string;
    readonly defaultQuestion: string;
    readonly resolveFailed: string;
    readonly switchDropped: (count: number) => string;
  };
  readonly stations: { readonly count: (count: number) => string; readonly limit: string };
  readonly detail: { readonly close: string; readonly photo: string; readonly photoAlt: string };
  readonly events: {
    readonly layer: string;
    readonly legend: string;
    readonly source: string;
    readonly none: string;
    readonly unverified: string;
    readonly reports: (count: number) => string;
    readonly timeNotStated: string;
    readonly placeFromText: string;
    readonly status: Readonly<Record<string, string>>;
    readonly demo: string;
  };
};

const EN: Copy = {
  stations: { count: (count) => (count === 1 ? "1 station" : `${count} stations`), limit: "You can send up to 5 stations at once. Deselect one to add another." },
  detail: { close: "Close details", photo: "Site photo not added yet", photoAlt: "Placeholder for a photo of the air monitor's location" },
  chips: {
    added: (count) => `Added to your message, ${count} of 4.`,
    addPin: "Add pin to chat",
    count: (count) => `${count} of 4 · sent with your message`,
    defaultQuestion: "Summarise this and tell me how it affects me.",
    drop: "Drop to add as context",
    duplicate: "Already attached.",
    kinds: { article: "ARTICLE", event: "EVENT", station: "STATION" },
    limit: "Limit reached: 4 of 4. Remove one to add another.",
    pinAdded: "Pin added to chat",
    placeholder: "Ask about what you attached…",
    remove: (title) => `Remove ${title} from message`,
    removed: (title) => `Removed ${title} from your message.`,
    resolveFailed: "Could not load the attached items. Your message was not sent.",
    switchDropped: (count) => `${count} attached ${count === 1 ? "item was" : "items were"} removed because ${count === 1 ? "it belongs" : "they belong"} to the other language's feed.`,
    trayLabel: "Attached context",
    unavailable: "no longer available",
  },
  events: {
    demo: "Sample events",
    layer: "Events",
    legend: "Potential events",
    none: "No reported events right now. Events leave the map 12 hours after the report unless an end time is given.",
    placeFromText: "Place taken from the article text",
    reports: (count) => (count === 1 ? "Reported by 1 outlet" : `${count} reports from different outlets`),
    source: "Events come from English-language news only.",
    status: { ongoing: "ongoing", over: "over", planned: "planned", unknown: "status unknown" },
    timeNotStated: "event time not stated",
    unverified: "unverified",
  },
  news: {
    add: "Add article to chat",
    all: "All",
    articles: (count) => `${count} articles`,
    demo: "Sample data, not real news",
    dragHint: "Opens the publisher in a new tab · drag into chat, or use +",
    empty: "No news yet. Sources are added by hand and checked hourly.",
    emptyFilter: "No articles match this filter.",
    error: "News is unavailable right now.",
    inChat: "IN CHAT",
    loading: "Loading news",
    opensNewTab: "opens in a new tab",
    showAll: "Show all topics",
    sources: "English sources",
    topics: {
      ENVIRONMENT: "Environment", HEALTH: "Health", OTHER: "Other", POLICY: "Policy", PROTEST: "Protests", TRAFFIC: "Traffic",
    },
  },
  panel: { close: "Close panel", label: "Side panel", map: "Map", news: "News", timeline: "Timeline" },
  timeline: {
    demo: "Sample entries, to be replaced by curated ones",
    empty: "No entries yet. Entries are added by hand.",
    error: "The timeline is unavailable right now.",
    heading: "Timeline",
    note: "Hand-curated events. Each links to its sources.",
    sources: (count) => (count === 1 ? "1 source" : `${count} sources`),
  },
};

const ID: Copy = {
  stations: { count: (count) => `${count} stasiun`, limit: "Anda dapat mengirim hingga 5 stasiun sekaligus. Batalkan satu untuk menambah yang lain." },
  detail: { close: "Tutup detail", photo: "Foto lokasi belum ditambahkan", photoAlt: "Tempat foto lokasi monitor kualitas udara" },
  chips: {
    added: (count) => `Ditambahkan ke pesan Anda, ${count} dari 4.`,
    addPin: "Tambahkan pin ke obrolan",
    count: (count) => `${count} dari 4 · dikirim bersama pesan Anda`,
    defaultQuestion: "Ringkas ini dan jelaskan pengaruhnya bagi saya.",
    drop: "Lepas untuk menambahkan sebagai konteks",
    duplicate: "Sudah dilampirkan.",
    kinds: { article: "ARTIKEL", event: "KEJADIAN", station: "STASIUN" },
    limit: "Batas tercapai: 4 dari 4. Hapus satu untuk menambah yang lain.",
    pinAdded: "Pin ditambahkan ke obrolan",
    placeholder: "Tanyakan tentang yang Anda lampirkan…",
    remove: (title) => `Hapus ${title} dari pesan`,
    removed: (title) => `${title} dihapus dari pesan Anda.`,
    resolveFailed: "Lampiran tidak dapat dimuat. Pesan Anda belum dikirim.",
    switchDropped: (count) => `${count} lampiran dihapus karena berasal dari umpan berita bahasa lain.`,
    trayLabel: "Konteks terlampir",
    unavailable: "tidak tersedia lagi",
  },
  events: {
    demo: "Contoh kejadian",
    layer: "Kejadian",
    legend: "Potensi kejadian",
    none: "Belum ada kejadian yang dilaporkan. Kejadian hilang dari peta 12 jam setelah laporan kecuali ada waktu selesai.",
    placeFromText: "Lokasi diambil dari teks artikel",
    reports: (count) => (count === 1 ? "Dilaporkan oleh 1 media" : `${count} laporan dari media berbeda`),
    source: "Kejadian hanya berasal dari berita berbahasa Indonesia.",
    status: { ongoing: "berlangsung", over: "selesai", planned: "direncanakan", unknown: "status belum diketahui" },
    timeNotStated: "waktu kejadian tidak disebutkan",
    unverified: "belum terverifikasi",
  },
  news: {
    add: "Tambahkan artikel ke obrolan",
    all: "Semua",
    articles: (count) => `${count} artikel`,
    demo: "Data contoh, bukan berita sungguhan",
    dragHint: "Membuka situs penerbit di tab baru · seret ke obrolan, atau gunakan +",
    empty: "Belum ada berita. Sumber ditambahkan manual dan diperiksa setiap jam.",
    emptyFilter: "Tidak ada artikel untuk filter ini.",
    error: "Berita belum dapat dimuat.",
    inChat: "DI OBROLAN",
    loading: "Memuat berita",
    opensNewTab: "dibuka di tab baru",
    showAll: "Tampilkan semua topik",
    sources: "Sumber berita Bahasa Indonesia",
    topics: {
      ENVIRONMENT: "Lingkungan", HEALTH: "Kesehatan", OTHER: "Lainnya", POLICY: "Kebijakan", PROTEST: "Unjuk rasa", TRAFFIC: "Lalu lintas",
    },
  },
  panel: { close: "Tutup panel", label: "Panel samping", map: "Peta", news: "Berita", timeline: "Linimasa" },
  timeline: {
    demo: "Contoh entri, akan diganti entri kurasi",
    empty: "Belum ada entri. Entri ditambahkan manual.",
    error: "Linimasa belum dapat dimuat.",
    heading: "Linimasa",
    note: "Peristiwa yang dikurasi manual. Setiap entri memuat sumbernya.",
    sources: (count) => `${count} sumber`,
  },
};

export function getNewsCopy(language: Language): Copy {
  return language === "id" ? ID : EN;
}
