"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface LightboxImage {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

interface LightboxState {
  groupId: string;
  images: readonly LightboxImage[];
  index: number;
  triggerEl: HTMLElement | null;
}

interface LightboxContextValue {
  activeGroupId: string | null;
  openLightbox: (
    groupId: string,
    images: readonly LightboxImage[],
    index: number,
    triggerEl: HTMLElement | null
  ) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox() {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error("useLightbox must be used within a LightboxProvider");
  return ctx;
}

// Lets a carousel pause its autoplay only while ITS OWN images are showing in
// the (single, shared) lightbox - never when a different feature's modal is open.
export function useIsLightboxGroupActive(groupId: string) {
  const ctx = useContext(LightboxContext);
  return ctx?.activeGroupId === groupId;
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);

  const openLightbox = useCallback(
    (
      groupId: string,
      images: readonly LightboxImage[],
      index: number,
      triggerEl: HTMLElement | null
    ) => {
      setState({ groupId, images, index, triggerEl });
    },
    []
  );

  const close = useCallback(() => setState(null), []);

  const navigate = useCallback((nextIndex: number) => {
    setState((prev) => (prev ? { ...prev, index: nextIndex } : prev));
  }, []);

  const contextValue = useMemo<LightboxContextValue>(
    () => ({ activeGroupId: state?.groupId ?? null, openLightbox }),
    [state?.groupId, openLightbox]
  );

  return (
    <LightboxContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {state && <LightboxModal key="lightbox" state={state} onClose={close} onNavigate={navigate} />}
      </AnimatePresence>
    </LightboxContext.Provider>
  );
}

function LightboxModal({
  state,
  onClose,
  onNavigate,
}: {
  state: LightboxState;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const { images, index, triggerEl } = state;
  const total = images.length;
  const current = images[index];
  const prefersReducedMotion = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState(0);

  const goTo = useCallback(
    (next: number) => {
      setDirection(next > index || (index === total - 1 && next === 0) ? 1 : -1);
      onNavigate(((next % total) + total) % total);
    },
    [index, total, onNavigate]
  );

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      triggerEl?.focus();
    };
  }, [triggerEl]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (total > 1 && e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1);
        return;
      }
      if (total > 1 && e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1);
        return;
      }
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goTo, index, total]);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/90 p-4 sm:p-8"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={prefersReducedMotion ? undefined : { opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: "easeOut" }}
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close image preview"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6 sm:top-6"
      >
        <X className="size-5" />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous screenshot"
            onClick={(e) => {
              e.stopPropagation();
              goTo(index - 1);
            }}
            className="absolute left-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next screenshot"
            onClick={(e) => {
              e.stopPropagation();
              goTo(index + 1);
            }}
            className="absolute right-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4"
          >
            <ChevronRight className="size-5" />
          </button>

          <div
            aria-live="polite"
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur"
          >
            {index + 1} / {total}
          </div>
        </>
      )}

      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={current.src}
          custom={direction}
          variants={slideVariants}
          initial={prefersReducedMotion ? "center" : "enter"}
          animate="center"
          exit={prefersReducedMotion ? undefined : "exit"}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: "easeOut" }}
          className="relative flex max-h-full max-w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt}
            width={current.width}
            height={current.height}
            className="max-h-[70vh] max-w-[72vw] rounded-xl object-contain shadow-2xl shadow-black/50 sm:max-h-[72vh] sm:max-w-[70vw]"
          />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
