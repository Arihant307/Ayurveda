import { cn } from "@/lib/cn";

/** Decorative botanical line art. Always aria-hidden. */
export function LeafSprig({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 260"
      fill="none"
      aria-hidden="true"
      className={cn("pointer-events-none", animated && "origin-bottom animate-sway", className)}
    >
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M100 255C100 190 108 120 140 40" />
        <path d="M102 210C70 200 50 172 46 138c32 8 52 36 56 72Z" fill="currentColor" fillOpacity="0.08" />
        <path d="M104 172c34-8 56-34 62-70-34 6-56 32-62 70Z" fill="currentColor" fillOpacity="0.1" />
        <path d="M112 128c-26-12-38-38-36-66 26 12 40 38 36 66Z" fill="currentColor" fillOpacity="0.08" />
        <path d="M124 92c22-10 34-32 34-58-22 10-34 32-34 58Z" fill="currentColor" fillOpacity="0.1" />
        <path d="M102 210 70 172M104 172l40-46M112 128 88 86M124 92l22-36" strokeOpacity="0.5" />
      </g>
    </svg>
  );
}

export function Mandala({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className={cn("pointer-events-none", className)}>
      <g stroke="currentColor" strokeWidth="1">
        <circle cx="100" cy="100" r="96" strokeOpacity="0.5" />
        <circle cx="100" cy="100" r="70" strokeOpacity="0.4" />
        <circle cx="100" cy="100" r="30" strokeOpacity="0.5" />
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d="M100 30c10 14 10 26 0 40-10-14-10-26 0-40Z"
            transform={`rotate(${i * 30} 100 100)`}
            fill="currentColor"
            fillOpacity="0.05"
          />
        ))}
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx="100" cy="8" r="2" transform={`rotate(${i * 15} 100 100)`} fill="currentColor" fillOpacity="0.3" />
        ))}
      </g>
    </svg>
  );
}

/** Soft organic wave used between sections. */
export function Wave({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("block h-8 w-full md:h-12", flip && "rotate-180", className)}
    >
      <path d="M0 30c240 30 480 30 720 0s480-30 720 0v30H0Z" fill="currentColor" />
    </svg>
  );
}
