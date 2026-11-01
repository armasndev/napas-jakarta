"use client";

import { useEffect, useState } from "react";
import type { Language } from "@/lib/i18n";
import type { TimelineEntry } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";

type LoadState = "loading" | "ready" | "error";

function sourceHost(source: string): string {
  try {
    return new URL(source).hostname;
  } catch {
    return source;
  }
}

export function TimelinePanel({ language }: { readonly language: Language }) {
  const copy = getNewsCopy(language).timeline;
  const [entries, setEntries] = useState<readonly TimelineEntry[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/timeline?language=${language}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("timeline"))))
      .then((payload: { entries?: TimelineEntry[] }) => {
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setState("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, [language]);

  return (
    <div className="timeline-panel">
      <header className="timeline-head">
        <h2>{copy.heading}</h2>
        <p>{copy.note}</p>
      </header>
      {entries.some((entry) => entry.demo) ? <p className="news-demo" role="note">{copy.demo}</p> : null}
      {state === "loading" ? <p className="news-state" role="status">…</p> : null}
      {state === "error" ? <p className="news-state" role="alert">{copy.error}</p> : null}
      {state === "ready" && entries.length === 0 ? <p className="news-state">{copy.empty}</p> : null}
      <ol className="timeline-list">
        {entries.map((entry) => (
          <li className="timeline-item" key={entry.id}>
            <time className="timeline-date" dateTime={entry.date}>{entry.date}</time>
            <div className="timeline-card">
              <p className="timeline-meta">
                {entry.category ? <span className="news-tag" data-topic={entry.category.toUpperCase()}>{entry.category}</span> : null}
                <span>{copy.sources(entry.sources.length)}</span>
              </p>
              <h3>{entry.title}</h3>
              {entry.summary ? <p>{entry.summary}</p> : null}
              {entry.sources.length > 0 ? (
                <ul className="timeline-sources">
                  {entry.sources.map((source) => (
                    <li key={source}>
                      <a href={source} rel="noopener noreferrer" target="_blank">{sourceHost(source)}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
