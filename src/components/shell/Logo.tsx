/** Product mark: a stormwater drop over a street grid. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="4" fill="#0b5fcc" />
      <path d="M6 22h20M6 16h9M11 6v20" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M21 7c3.3 4.2 5 7 5 9.2a5 5 0 0 1-10 0C16 14 17.7 11.2 21 7z" fill="#ffffff" />
    </svg>
  );
}
