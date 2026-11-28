"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsLightboxGroupActive, useLightbox } from "./Lightbox";

export interface FeatureMediaImage {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

const AUTOPLAY_MS = 4500;

// Shared "frame" chrome (gradient border, rounded corners, shadow) used for
// both a single screenshot and a multi-screenshot carousel, so every feature
// in the showcase reads as one consistent visual system.
function MediaFrame({
  children,
  aspectRatio,
}: {
  children: React.ReactNode;
  aspectRatio: number;
}) {
  return (
    <div className="relative z-0 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-200 via-stone-200 to-orange-100 p-px shadow-xl shadow-stone-900/10 transition-shadow duration-300 ease-out hover:z-10 hover:shadow-2xl">
      <div
        className="relative w-full overflow-hidden rounded-[15px] bg-stone-50"
        style={{ aspectRatio }}
      >
        {children}
      </div>
    </div>
  );
}

// A single screenshot, presented large with its own hover scale/elevation.
function SingleImage({ image, groupId }: { image: FeatureMediaImage; groupId: string }) {
  const { openLightbox } = useLightbox();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <MediaFrame aspectRatio={image.width / image.height}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`View full-size screenshot: ${image.alt}`}
        onClick={() => openLightbox(groupId, [image], 0, triggerRef.current)}
        className="group absolute inset-0 block w-full cursor-zoom-in border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      >
        <Image
          src={image.src}
          alt={image.alt}
          fill
          unoptimized
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.06]"
        />
      </button>
    </MediaFrame>
  );
}

// Reusable horizontal carousel for features with more than one screenshot.
// Auto-advances, pauses on hover/focus, supports manual prev/next and
// pagination dots, and keeps a fixed frame size so the surrounding layout
// never shifts between slides.
function ImageCarousel({ images, groupId }: { images: readonly FeatureMediaImage[]; groupId: string }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { openLightbox } = useLightbox();
  const isLightboxActive = useIsLightboxGroupActive(groupId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const total = images.length;

  const goTo = useCallback(
    (next: number) => {
      setDirection(next > index || (index === total - 1 && next === 0) ? 1 : -1);
      setIndex(((next % total) + total) % total);
    },
    [index, total]
  );

  // Autoplay. Recreated only when pause/reduced-motion/image-count changes -
  // never torn down and rebuilt on every tick - so the interval can't leak.
  useEffect(() => {
    if (isPaused || isLightboxActive || prefersReducedMotion || total <= 1) return;
    const id = setInterval(() => {
      setDirection(1);
      setIndex((prev) => (prev + 1) % total);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [isPaused, isLightboxActive, prefersReducedMotion, total]);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 36 : -36, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -36 : 36, opacity: 0 }),
  };

  const current = images[index];

  return (
    <MediaFrame aspectRatio={images[0].width / images[0].height}>
      <div
        className="group absolute inset-0"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.button
            key={index}
            ref={triggerRef}
            type="button"
            aria-label={`View full-size screenshot ${index + 1} of ${total}: ${current.alt}`}
            onClick={() => openLightbox(groupId, images, index, triggerRef.current)}
            custom={direction}
            variants={slideVariants}
            initial={prefersReducedMotion ? false : "enter"}
            animate="center"
            exit={prefersReducedMotion ? undefined : "exit"}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: "easeOut" }}
            className="absolute inset-0 block w-full cursor-zoom-in border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            <Image
              src={current.src}
              alt={current.alt}
              fill
              unoptimized
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-contain transition-transform duration-300 ease-out will-change-transform hover:scale-[1.06]"
            />
          </motion.button>
        </AnimatePresence>

        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous screenshot"
              onClick={() => goTo(index - 1)}
              className="absolute left-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/80 bg-white/90 text-stone-700 opacity-70 shadow-md backdrop-blur transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next screenshot"
              onClick={() => goTo(index + 1)}
              className="absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/80 bg-white/90 text-stone-700 opacity-70 shadow-md backdrop-blur transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <ChevronRight className="size-4" />
            </button>

            <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5">
              {images.map((img, i) => (
                <button
                  key={img.src}
                  type="button"
                  aria-label={`Show screenshot ${i + 1} of ${total}`}
                  aria-current={i === index}
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? "w-5 bg-orange-600" : "w-1.5 bg-stone-900/20 hover:bg-stone-900/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </MediaFrame>
  );
}

export default function FeatureMedia({
  images,
  groupId,
}: {
  images: readonly FeatureMediaImage[];
  groupId: string;
}) {
  if (images.length === 1) return <SingleImage image={images[0]} groupId={groupId} />;
  return <ImageCarousel images={images} groupId={groupId} />;
}
