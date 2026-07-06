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

export default function PresenceBar({ users, currentUserId, maxVisible = 5 }: Props) {
  const others = users.filter((u) => u.userId !== currentUserId);
  const me = users.find((u) => u.userId === currentUserId);
  const visible = others.slice(0, maxVisible);
  const overflow = Math.max(0, others.length - maxVisible);

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

        {overflow > 0 && (
          <div className={`avatar avatar-sm ${styles.avatar} ${styles.avatarOverflow}`}>
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}
