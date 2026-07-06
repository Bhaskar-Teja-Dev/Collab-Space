import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogOut, Users, Clock, Globe, Lock, Trash2, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { disconnectSocket } from '../lib/socket';
import { Skeleton } from '../components/ui';
import styles from './Dashboard.module.css';

interface Room {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  createdAt: string;
  owner: { id: string; displayName: string; avatarColor: string };
  _count?: { members: number };
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPublic, setNewRoomPublic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      const { rooms } = await api.rooms.list();
      setRooms(rooms);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setIsCreating(true);
    try {
      const { room } = await api.rooms.create(newRoomName.trim(), newRoomPublic);
      setRooms((prev) => [room, ...prev]);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomPublic(false);
      navigate(`/room/${room.slug}`);
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRoom = async (slug: string) => {
    if (!confirm('Delete this room? This cannot be undone.')) return;
    try {
      await api.rooms.delete(slug);
      setRooms((prev) => prev.filter((r) => r.slug !== slug));
    } catch (err) {
      console.error('Failed to delete room:', err);
    }
  };

  const handleCopyLink = async (slug: string) => {
    const url = `${window.location.origin}/room/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleLogout = () => {
    disconnectSocket();
    clearAuth();
    navigate('/', { replace: true });
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <div className={styles.logoMark}>C</div>
            <span>CollabSpace</span>
          </div>

          <div className={styles.headerRight}>
            {user && (
              <div className={styles.userInfo}>
                <div
                  className={`avatar avatar-sm ${styles.avatar}`}
                  style={{ background: user.avatarColor }}
                >
                  {getInitials(user.displayName)}
                </div>
                <span className={styles.userName}>{user.displayName}</span>
              </div>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
              id="logout-btn"
              title="Sign out"
            >
              <LogOut size={16} />
              <span className={styles.logoutText}>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className={styles.main}>
        <div className={styles.mainInner}>
          {/* Page title */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Your Rooms</h1>
              <p className={styles.pageSub}>
                Create a room and share the link with your team to start collaborating.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
              id="create-room-btn"
            >
              <Plus size={18} />
              New Room
            </button>
          </div>

          {/* Room list */}
          {isLoading ? (
            <div className={styles.roomGrid}>
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className={`card ${styles.roomCard}`} style={{ gap: 'var(--space-4)' }}>
                  <div className={styles.roomCardTop}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <Skeleton width="60%" height={20} />
                      <Skeleton width="20%" height={16} borderRadius="var(--radius-full)" />
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                      <Skeleton width="30%" height={12} />
                      <Skeleton width="30%" height={12} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Skeleton width="70%" height={32} />
                    <Skeleton width="15%" height={32} />
                    <Skeleton width="15%" height={32} />
                  </div>
                </div>
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Users size={32} />
              </div>
              <h2>No rooms yet</h2>
              <p>Create your first room to start collaborating in real time.</p>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
                id="create-room-empty"
              >
                <Plus size={16} />
                Create Your First Room
              </button>
            </div>
          ) : (
            <div className={styles.roomGrid}>
              {rooms.map((room) => (
                <div key={room.id} className={`card ${styles.roomCard}`}>
                  <div className={styles.roomCardTop}>
                    <div className={styles.roomCardHeader}>
                      <h3 className={styles.roomName}>{room.name}</h3>
                      <div className={styles.roomBadge}>
                        {room.isPublic ? (
                          <span className="badge badge-success">
                            <Globe size={10} /> Public
                          </span>
                        ) : (
                          <span className="badge badge-accent">
                            <Lock size={10} /> Private
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.roomMeta}>
                      <span>
                        <Users size={12} />
                        {room._count?.members ?? 1} member{(room._count?.members ?? 1) !== 1 ? 's' : ''}
                      </span>
                      <span>
                        <Clock size={12} />
                        {formatDate(room.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.roomCardActions}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => navigate(`/room/${room.slug}`)}
                      id={`open-room-${room.slug}`}
                    >
                      Open Room
                    </button>
                    <button
                      className="btn btn-secondary btn-sm btn-icon"
                      onClick={() => handleCopyLink(room.slug)}
                      title="Copy invite link"
                      id={`copy-link-${room.slug}`}
                    >
                      {copiedSlug === room.slug ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    {room.owner.id === user?.id && (
                      <button
                        className="btn btn-danger btn-sm btn-icon"
                        onClick={() => handleDeleteRoom(room.slug)}
                        title="Delete room"
                        id={`delete-room-${room.slug}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Create Room Modal ── */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>Create a Room</h2>
            <p style={{ color: 'var(--color-text-2)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              Give your room a name. You'll get a shareable link to invite your team.
            </p>

            <form onSubmit={handleCreateRoom}>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label className="label" htmlFor="room-name">Room Name</label>
                <input
                  id="room-name"
                  className="input"
                  type="text"
                  placeholder="e.g. Product Sprint Q3"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                  maxLength={64}
                  autoFocus
                />
              </div>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={newRoomPublic}
                  onChange={(e) => setNewRoomPublic(e.target.checked)}
                  id="room-public"
                />
                <span>Make this room public (anyone with the link can join)</span>
              </label>

              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowCreateModal(false)}
                  id="cancel-create-room"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={isCreating || !newRoomName.trim()}
                  id="confirm-create-room"
                >
                  {isCreating ? <span className="spinner" style={{ width: 16, height: 16 }} /> : (
                    <><Plus size={16} /> Create Room</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
