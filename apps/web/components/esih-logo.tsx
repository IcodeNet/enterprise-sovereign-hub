// ESIH's logo mark: a central hub node radiating connections to six outer
// nodes, evoking a small neural network or knowledge graph — the "intelligence"
// idea made visual. Built as a component (not a static image file) so it
// scales crisply at any size and can inherit color via currentColor if needed.
export function EsihLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="ESIH logo"
    >
      <defs>
        <linearGradient id="esih-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f7cff" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {/* outer ring: containment / sovereignty */}
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="url(#esih-logo-gradient)"
        strokeWidth="2.5"
        opacity="0.35"
      />
      {/* connections radiating from the central hub to six outer nodes */}
      <g stroke="url(#esih-logo-gradient)" strokeWidth="1.6" opacity="0.55">
        <line x1="60" y1="60" x2="60" y2="20" />
        <line x1="60" y1="60" x2="94" y2="40" />
        <line x1="60" y1="60" x2="94" y2="80" />
        <line x1="60" y1="60" x2="60" y2="100" />
        <line x1="60" y1="60" x2="26" y2="80" />
        <line x1="60" y1="60" x2="26" y2="40" />
      </g>
      {/* outer nodes */}
      <g fill="url(#esih-logo-gradient)">
        <circle cx="60" cy="20" r="5" />
        <circle cx="94" cy="40" r="5" />
        <circle cx="94" cy="80" r="5" />
        <circle cx="60" cy="100" r="5" />
        <circle cx="26" cy="80" r="5" />
        <circle cx="26" cy="40" r="5" />
      </g>
      {/* central hub node */}
      <circle
        cx="60"
        cy="60"
        r="12"
        fill="#0b0c10"
        stroke="url(#esih-logo-gradient)"
        strokeWidth="2.5"
      />
      <circle cx="60" cy="60" r="4.5" fill="url(#esih-logo-gradient)" />
    </svg>
  );
}
