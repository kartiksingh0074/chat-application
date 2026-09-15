import type { SVGProps } from 'react';

/**
 * The app's icons, drawn by hand rather than taken from an icon package, so the
 * UI adds no dependency (PROJECT.md 10 asks before adding one). They replace
 * emoji, which rendered at inconsistent sizes and weights across platforms - and
 * the envelope rendered as a blank rectangle on Windows.
 *
 * All share one grid: 24x24, 1.75 stroke, round caps, drawn in currentColor,
 * so they size with font-size-like classes (size-4, size-5) and take the text
 * colour of whatever holds them. Decorative by default; give a labelled button
 * the accessible name instead.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number | string };

function Icon({ size = '1em', children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LogoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A1.5 1.5 0 0 1 5 13.5z" />
    <path d="M9 8h6M9 11h3.5" />
  </Icon>
);

export const HashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3.5 19c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5" />
    <path d="M15.5 4.9a3.25 3.25 0 0 1 0 6.2M17.5 14.4c1.6.7 2.7 2.3 3 4.6" />
  </Icon>
);

export const MessagePlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z" />
    <path d="M12 7.5v5M9.5 10h5" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5" />
    <path d="M16 16.5 20.5 12 16 7.5M20.5 12H9.5" />
  </Icon>
);

export const PaperclipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m20.5 11.2-8.4 8.4a5 5 0 0 1-7.1-7.1l8.4-8.4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12 3 4.5 21 12 3 19.5z" />
    <path d="M4.5 12H11" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </Icon>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2h-7.5a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </Icon>
);

/** The bot's mark. Filled rather than stroked, so it reads at avatar size. */
export const SparkleIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M12 2.5c.5 3.9 1.7 6.7 3.6 8.2 1.3 1 3.1 1.6 5.9 1.8-2.8.2-4.6.8-5.9 1.8-1.9 1.5-3.1 4.3-3.6 8.2-.5-3.9-1.7-6.7-3.6-8.2-1.3-1-3.1-1.6-5.9-1.8 2.8-.2 4.6-.8 5.9-1.8C10.3 9.2 11.5 6.4 12 2.5z" />
    <path d="M19 2.5c.2 1.4.6 2.2 1.1 2.7.5.4 1.1.6 1.9.8-.8.1-1.4.3-1.9.8-.5.4-.9 1.3-1.1 2.7-.2-1.4-.6-2.3-1.1-2.7-.5-.5-1.1-.7-1.9-.8.8-.2 1.4-.4 1.9-.8.5-.5.9-1.3 1.1-2.7z" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
    <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
  </Icon>
);

export const UserPlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 19.5c.7-3.3 3.2-5.3 6.5-5.3 1.6 0 3 .5 4.1 1.3" />
    <path d="M18.5 13.5v6M15.5 16.5h6" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="m20.5 16-4.5-4.5L6 19.5" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
