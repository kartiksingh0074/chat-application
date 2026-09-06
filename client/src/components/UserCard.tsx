import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config.js';
import { Avatar, Button, Spinner } from '../ui/primitives.js';

export interface UserProfile {
  id: string;
  username: string;
  avatarKey?: string | null;
  createdAt: string;
}

interface UserCardProps {
  userId: string;
  token: string;
  /** Where the click came from, so the card can appear next to it. */
  anchor: DOMRect;
  currentUserId: string;
  online: boolean;
  onClose: () => void;
  onMessage: (userId: string) => void;
}

const CARD_WIDTH = 260;
const GAP = 8;

const joinedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

export function UserCard({
  userId,
  token,
  anchor,
  currentUserId,
  online,
  onClose,
  onMessage,
}: UserCardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: anchor.bottom + GAP, left: anchor.left });

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setFailed(false);

    fetch(`${API_BASE_URL}/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { user: UserProfile }) => {
        if (!cancelled) setProfile(body.user);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  // Keep the card on screen: flip above the anchor when it would overflow the
  // bottom, and pull it left when it would overflow the right edge.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 200;
    const top =
      anchor.bottom + GAP + height > window.innerHeight
        ? Math.max(GAP, anchor.top - GAP - height)
        : anchor.bottom + GAP;
    const left = Math.max(GAP, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - GAP));
    setPosition({ top, left });
  }, [anchor, profile]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isYou = userId === currentUserId;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        ref={cardRef}
        role="dialog"
        aria-label="User profile"
        onClick={(e) => e.stopPropagation()}
        style={{ top: position.top, left: position.left, width: CARD_WIDTH }}
        className="animate-pop-in fixed rounded-card border border-border-subtle bg-surface-raised p-4 shadow-xl"
      >
        {failed ? (
          <p className="text-sm text-content-muted">Could not load this profile.</p>
        ) : !profile ? (
          <div className="flex justify-center py-6 text-content-muted">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="relative shrink-0">
                <Avatar name={profile.username} avatarKey={profile.avatarKey} size={52} />
                <span
                  title={online ? 'Online' : 'Offline'}
                  className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-[3px] border-surface-raised
                    ${online ? 'bg-success' : 'bg-content-muted'}`}
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-content">{profile.username}</p>
                <p className="text-xs text-content-muted">{online ? 'Online' : 'Offline'}</p>
              </div>
            </div>

            <dl className="rounded-lg bg-surface-sunken p-2.5 text-xs">
              <dt className="font-semibold uppercase tracking-wide text-content-muted">Member since</dt>
              <dd className="mt-0.5 text-content">{joinedFormatter.format(new Date(profile.createdAt))}</dd>
            </dl>

            {!isYou && (
              <Button
                onClick={() => {
                  onMessage(profile.id);
                  onClose();
                }}
                className="w-full"
              >
                Message
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
