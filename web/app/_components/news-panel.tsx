"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Language } from "@/lib/i18n";
import { chipKey, type ContextChip, type NewsItem, type NewsTopic } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";
import { formatNewsTime } from "@/lib/news-format";
import { chipDragProps } from "./chip-card";

const FILTERS: readonly (NewsTopic | "ALL")[] = ["ALL", "PROTEST", "TRAFFIC", "POLICY", "HEALTH"];

export function articleChip(item: NewsItem, language: Language): ContextChip {
  return {
    id: item.id,
    kind: "article",
    sub: `${item.outlet} · ${formatNewsTime(item.published_at, language)}`,
    title: item.title,
  };
}

type LoadState = "loading" | "ready" | "error";

export function NewsPanel({
  attachedKeys,
  language,
  onAdd,
}: {
  readonly attachedKeys: ReadonlySet<string>;
  readonly language: Language;
  readonly onAdd: (chip: ContextChip) => void;
}) {
  const copy = getNewsCopy(language);
  const [items, setItems] = useState<readonly NewsItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [filter, setFilter] = useState<NewsTopic | "ALL">("ALL");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/news?language=${language}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("news"))))
      .then((payload: { items?: NewsItem[] }) => {
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setState("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, [language]);

  const visible = useMemo(
    () => (filter === "ALL" ? items : items.filter((item) => item.topic === filter)),
    [filter, items],
  );
  const hasDemo = items.some((item) => item.demo);

  return (
    <div className="news-panel">
      <div className="news-toolbar">
        <div aria-label={copy.news.sources} className="news-filters" role="group">
          {FILTERS.map((value) => (
            <button
              aria-pressed={filter === value}
              className="news-filter"
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {value === "ALL" ? copy.news.all : copy.news.topics[value]}
            </button>
          ))}
        </div>
        <p className="news-hint">{copy.news.dragHint}</p>
      </div>
      {hasDemo ? <p className="news-demo" role="note">{copy.news.demo}</p> : null}
      {state === "loading" ? <p className="news-state" role="status">{copy.news.loading}</p> : null}
      {state === "error" ? <p className="news-state" role="alert">{copy.news.error}</p> : null}
      {state === "ready" && items.length === 0 ? <p className="news-state">{copy.news.empty}</p> : null}
      {state === "ready" && items.length > 0 && visible.length === 0 ? (
        <div className="news-state">
          <p>{copy.news.emptyFilter}</p>
          <button className="news-filter" onClick={() => setFilter("ALL")} type="button">{copy.news.showAll}</button>
        </div>
      ) : null}
      <ul className="news-list" lang={language}>
        {visible.map((item) => {
          const chip = articleChip(item, language);
          const attached = attachedKeys.has(chipKey(chip));
          return (
            <li className="news-row" key={item.id} {...chipDragProps(chip)}>
              <span aria-hidden="true" className="news-grip">⋮⋮</span>
              <a
                aria-label={`${item.title} (${item.outlet}, ${copy.news.opensNewTab})`}
                className="news-link"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="news-meta">
                  <span className="news-tag" data-topic={item.topic}>{copy.news.topics[item.topic]}</span>
                  <span>{item.outlet} · {formatNewsTime(item.published_at, language)}</span>
                  {attached ? <strong className="news-inchat">{copy.news.inChat}</strong> : null}
                </span>
                <span className="news-title">{item.title}<span aria-hidden="true"> ↗</span></span>
                {item.excerpt ? <span className="news-excerpt">{item.excerpt}</span> : null}
              </a>
              <button
                aria-label={`${copy.news.add}: ${item.title}`}
                className="news-add"
                onClick={() => onAdd(chip)}
                type="button"
              >
                <PlusIcon aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
