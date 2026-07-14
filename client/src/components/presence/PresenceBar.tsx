import { useState, useRef, useEffect } from 'react';
import type { PresenceUser } from '@collab-space/shared';
import styles from './PresenceBar.module.css';

interface Props {
  users: PresenceUser[];
  currentUserId: string;
  maxVisible?: number;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function PresenceBar({ users, currentUserId, maxVisible = 2 }: Props) {
  const others = users.filter((u) => u.userId !== currentUserId);
  const me = users.find((u) => u.userId === currentUserId);
  const visible = others.slice(0, maxVisible);
  const overflowUsers = others.slice(maxVisible);
  const overflow = overflowUsers.length;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredUser, setHoveredUser] = useState<PresenceUser | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [dropdownOpen]);

  const handleRowMouseEnter = (user: PresenceUser, e: React.MouseEvent<HTMLDivElement>) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPos({ top: rect.top, left: rect.right + 8 });
    tooltipTimeout.current = setTimeout(() => setHoveredUser(user), 80);
  };

  const handleRowMouseLeave = () => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => setHoveredUser(null), 120);
  };

  return (
    <div className={styles.bar} aria-label="Active collaborators">
      {/* Live indicator */}
      <div className={styles.liveChip}>
        <span className={styles.liveDot} />
        <span>{users.length} online</span>
      </div>

      {/* Avatar stack */}
      <div className={styles.avatarStack}>
        {visible.map((user) => (
          <div
            key={user.userId}
            className={`avatar avatar-sm ${styles.avatar}`}
            style={{ background: user.avatarColor }}
            title={user.displayName}
          >
            {getInitials(user.displayName)}
          </div>
        ))}

        {me && (
          <div
            className={`avatar avatar-sm ${styles.avatar} ${styles.avatarMe}`}
            style={{ background: me.avatarColor }}
            title={`${me.displayName} (you)`}
          >
            {getInitials(me.displayName)}
          </div>
        )}

        {/* Overflow — clickable when 1+ overflow users */}
        {overflow > 0 && (
          <div className={styles.overflowWrapper} ref={dropdownRef}>
            <button
              className={`avatar avatar-sm ${styles.avatar} ${styles.avatarOverflow} ${styles.overflowBtn}`}
              onClick={() => setDropdownOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              title={`${overflow} more collaborator${overflow > 1 ? 's' : ''}`}
            >
              ···
            </button>

            {dropdownOpen && (
              <div className={styles.dropdown} role="listbox" aria-label="All collaborators">
                <p className={styles.dropdownHeader}>
                  {overflow} more collaborator{overflow !== 1 ? 's' : ''}
                </p>
                {overflowUsers.map((user) => (
                  <div
                    key={user.userId}
                    role="option"
                    aria-selected={false}
                    className={styles.dropdownRow}
                    onMouseEnter={(e) => handleRowMouseEnter(user, e)}
                    onMouseLeave={handleRowMouseLeave}
                  >
                    <div
                      className={`avatar avatar-sm ${styles.dropdownAvatar}`}
                      style={{ background: user.avatarColor }}
                    >
                      {getInitials(user.displayName)}
                    </div>
                    <span className={styles.dropdownName}>{user.displayName}</span>
                    <span className={styles.dropdownStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover tooltip card — rendered at viewport level */}
      {hoveredUser && (
        <div
          className={styles.tooltipCard}
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          onMouseEnter={() => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); }}
          onMouseLeave={() => { tooltipTimeout.current = setTimeout(() => setHoveredUser(null), 120); }}
        >
          <div
            className={`avatar ${styles.tooltipAvatar}`}
            style={{ background: hoveredUser.avatarColor }}
          >
            {getInitials(hoveredUser.displayName)}
          </div>
          <div className={styles.tooltipInfo}>
            <p className={styles.tooltipName}>{hoveredUser.displayName}</p>
            <p className={styles.tooltipOnline}>
              <span className={styles.tooltipDot} />
              Online now
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
