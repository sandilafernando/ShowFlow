export function LogoMark({ size = 30, className = '', decorative = true }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'ShowFlow'}
      aria-hidden={decorative ? 'true' : undefined}
    >
      <rect x="4" y="4" width="504" height="504" rx="104" fill="#07090B" />
      <rect x="4.75" y="4.75" width="502.5" height="502.5" rx="103.25" stroke="#26303A" strokeWidth="1.5" />
      <path d="M137 174H315" stroke="#2DD4E6" strokeWidth="27" strokeLinecap="round" />
      <path d="M137 256H274" stroke="#7D8998" strokeWidth="27" strokeLinecap="round" />
      <path d="M137 338H232" stroke="#2DD4E6" strokeWidth="27" strokeLinecap="round" opacity="0.5" />
      <path d="M359 150V362" stroke="#39434F" strokeWidth="10" strokeLinecap="round" />
      <path d="M348 256L391 231V281L348 256Z" fill="#2DD4E6" />
      <circle cx="359" cy="150" r="9" fill="#7CECF7" />
    </svg>
  );
}

export function LogoLockup({ size = 32, subtitle = true }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={size} />
      <div>
        <div className="brand-name">ShowFlow</div>
        {subtitle ? <div className="brand-sub">Educational Media Unit</div> : null}
      </div>
    </div>
  );
}
