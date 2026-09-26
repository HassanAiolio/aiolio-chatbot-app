import { LOGO_PATH } from './logoPath';

export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" className={className} fill="none" aria-hidden="true">
      <path fill="currentColor" d={LOGO_PATH} />
    </svg>
  );
}
