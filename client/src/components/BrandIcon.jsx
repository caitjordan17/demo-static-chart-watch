export default function BrandIcon({ size = 28 }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M6 2.5h13l7 7V27a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 27V5A2.5 2.5 0 0 1 6 2.5Z"
        fill="var(--surface)" stroke="var(--red)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19 2.5V8a1.5 1.5 0 0 0 1.5 1.5H26"
        fill="var(--red-soft)" stroke="var(--red)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 12h10M8 16h10M8 20h6"
        stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="6.5" fill="var(--green-soft)" stroke="var(--green)" strokeWidth="1.5" />
      <path d="m21 24 2 2 4-4" stroke="var(--green-text)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
