/**
 * The assistant's mark: the ring and tail of the FolioQ logo. The ring turns
 * slowly so the gap in it travels round, and a soft glow breathes behind it.
 */
export default function QMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`qmark relative block ${className}`}>
      <span className="qmark-glow absolute inset-[12%] rounded-full bg-mint-400/40 blur-xl" />
      <svg viewBox="0 0 100 100" className="relative h-full w-full" fill="none">
        <circle
          className="qmark-ring"
          cx="47"
          cy="47"
          r="29"
          stroke="#f1f4f9"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="160 22.2"
        />
        <line x1="60" y1="60" x2="80" y2="80" stroke="var(--color-mint-400)" strokeWidth="10" strokeLinecap="round" />
      </svg>
    </span>
  )
}
