"use client";

import { useEffect, useRef, useState } from "react";
import { type Block, type LegalSection } from "./legalData";

function renderInline(text: string) {
  const parts = text.split("**");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-stone-900">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return <p className="text-[15px] leading-7 text-stone-600 sm:text-base">{renderInline(block.text)}</p>;
    case "h3":
      return <h3 className="mt-2 text-base font-semibold text-stone-900 sm:text-lg">{block.text}</h3>;
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-stone-600 sm:text-base">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-stone-600 sm:text-base">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "notice":
      return (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3.5 text-[15px] leading-7 text-orange-900 sm:text-base">
          {renderInline(block.text)}
        </div>
      );
    case "contact":
      return (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-[15px] leading-7 text-stone-700 sm:text-base">
          {block.lines.map((line, i) => (
            <div key={i}>{renderInline(line)}</div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default function LegalBody({ sections }: { sections: LegalSection[] }) {
  const [tocOpen, setTocOpen] = useState(false);
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setTocOpen(false);
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      {/* Mobile TOC dropdown */}
      <div className="border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        <div className="mx-auto max-w-5xl">
          <button
            type="button"
            onClick={() => setTocOpen((v) => !v)}
            aria-expanded={tocOpen}
            className="flex w-full items-center justify-between rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-900"
          >
            Table of Contents
            <span className={`transition-transform ${tocOpen ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {tocOpen && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-stone-200 p-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                    activeId === s.id ? "bg-orange-50 font-semibold text-orange-700" : "text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {s.number}. {s.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <nav
              className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-1 overflow-y-auto border-l border-stone-200 pl-4"
              aria-label="Table of contents"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">On this page</p>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                    activeId === s.id
                      ? "-ml-[17px] border-l-2 border-orange-600 pl-[14px] font-semibold text-orange-700"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {s.number}. {s.title}
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-12">
            {sections.map((s) => (
              <article
                key={s.id}
                id={s.id}
                ref={(el) => {
                  sectionRefs.current[s.id] = el;
                }}
                className="scroll-mt-28 space-y-3"
              >
                <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">
                  {s.number}. {s.title}
                </h2>
                {s.blocks.map((block, i) => (
                  <RenderBlock key={i} block={block} />
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
