import { useRef, useEffect } from 'react';
import type { PresenceUser } from '@collab-space/shared';
import styles from './CursorOverlay.module.css';

interface Props {
  users: PresenceUser[];
  currentUserId: string;
  containerRef: React.RefObject<HTMLDivElement>;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function CursorOverlay({ users, currentUserId, containerRef }: Props) {
  const remote = users.filter((u) => u.userId !== currentUserId && u.cursor != null);

  return (
    <div className={styles.overlay} aria-hidden="true">
      {remote.map((user) => (
        <RemoteCursor key={user.userId} user={user} containerRef={containerRef} />
      ))}
    </div>
  );
}

// ─── Individual animated cursor ───────────────────────────────────────────────

function RemoteCursor({
  user,
  containerRef,
}: {
  user: PresenceUser;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Use CSS custom property + transition for smooth interpolation
  useEffect(() => {
    if (!user.cursor || !ref.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = user.cursor.x * rect.width;
    const y = user.cursor.y * rect.height;

    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  }, [user.cursor, containerRef]);

  if (!user.cursor) return null;

  return (
    <div ref={ref} className={styles.cursor}>
      {/* SVG cursor arrow */}
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.cursorArrow}
      >
        <path
          d="M0 0L0 14.5L3.5 11L6 18L8 17L5.5 10H10.5L0 0Z"
          fill={user.avatarColor}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* Name label */}
      <div
        className={styles.cursorLabel}
        style={{ background: user.avatarColor }}
      >
        {user.displayName.split(' ')[0]}
      </div>
    </div>
  );
}
