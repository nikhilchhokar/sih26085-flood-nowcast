export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="9" fill="#0b1a33" stroke="#1f3a66" />
      {/* street grid */}
      <path d="M8 27h24M8 20h24M14 9v24M26 9v24" stroke="#27456f" strokeWidth="1.6" />
      {/* drain graph */}
      <path d="M14 13 L20 20 L26 27" stroke="#3b82f6" strokeWidth="2" fill="none" />
      <circle cx="14" cy="13" r="2" fill="#3b82f6" />
      <circle cx="20" cy="20" r="2.2" fill="#f97316" />
      <circle cx="26" cy="27" r="2.4" fill="#dc2626" />
      {/* droplet */}
      <path d="M29.5 6.5c2.3 3 3.5 5 3.5 6.6a3.5 3.5 0 0 1-7 0c0-1.6 1.2-3.6 3.5-6.6z" fill="#22d3ee" />
    </svg>
  );
}
