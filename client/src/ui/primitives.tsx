import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-content hover:bg-brand-hover',
  secondary: 'bg-surface-sunken text-content hover:bg-border-subtle',
  ghost: 'text-content-muted hover:bg-surface-sunken hover:text-content',
  danger: 'bg-danger text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
        disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-content
        placeholder:text-content-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30
        disabled:opacity-50 ${className}`}
    />
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-content">{label}</span>
      {children}
    </label>
  );
}

/** Deterministic avatar colour so a user looks the same everywhere. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hue = [...name].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: `oklch(0.62 0.15 ${hue})`,
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      <p className="text-sm font-medium text-content">{title}</p>
      {hint && <p className="text-sm text-content-muted">{hint}</p>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="animate-pop-in w-full max-w-md rounded-card border border-border-subtle bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-content">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close dialog" className="px-2 py-1">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Grey block standing in for content that hasn't arrived yet. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block rounded ${className}`} />;
}

// Uneven widths so the placeholder reads as a list of names rather than a grid.
const SKELETON_WIDTHS = ['w-28', 'w-20', 'w-32', 'w-24', 'w-16', 'w-28', 'w-20'];

/** Placeholder rows shaped like the conversation list, to avoid a layout jump. */
export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-0.5 py-3" aria-hidden>
      {SKELETON_WIDTHS.map((width, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
          <Skeleton className="size-[26px] shrink-0 rounded-lg" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows shaped like the message list. */
export function MessageListSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-4 p-4" aria-hidden>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
