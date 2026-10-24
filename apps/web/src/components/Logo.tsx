export function Logo({ size = 36, fill = 'url(#lg)' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22b8cf" /><stop offset="1" stopColor="#13315c" />
        </linearGradient>
      </defs>
      <path
        d="M32 6c-6 0-9 2-13 2-6 0-11 5-11 13 0 6 2 10 4 16 2 7 3 21 8 21 4 0 4-12 7-17 1-2 3-3 5-3s4 1 5 3c3 5 3 17 7 17 5 0 6-14 8-21 2-6 4-10 4-16 0-8-5-13-11-13-4 0-7-2-13-2z"
        fill={fill}
      />
    </svg>
  );
}
