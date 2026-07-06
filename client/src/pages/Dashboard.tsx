import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogOut, Users, Clock, Globe, Lock, Trash2, Copy, Check, User as UserIcon, Settings, Compass } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { disconnectSocket } from '../lib/socket';
import { Skeleton, useToast } from '../components/ui';
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

type TabType = 'my-rooms' | 'explore' | 'profile';

const SWATCHES = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#10b981', // Green
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#374151', // Dark grey
];

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const updateUser = useAuthStore((s) => s.updateUser);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('my-rooms');

  // Rooms lists
  const [rooms, setRooms] = useState<Room[]>([]);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);

  // Room creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPublic, setNewRoomPublic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Profile forms
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState('');
  const [bio, setBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync profile form state on user load
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setAvatarColor(user.avatarColor);
      setBio(user.bio || '');
    }
  }, [user]);

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

  const loadPublicRooms = useCallback(async () => {
    setIsLoadingPublic(true);
    try {
      const res = await api.rooms.explorePublic();
      setPublicRooms(res.rooms);
    } catch (err) {
      console.error('Failed to load public rooms:', err);
      showToast('Failed to load public rooms', 'danger');
    } finally {
      setIsLoadingPublic(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (activeTab === 'explore') {
      loadPublicRooms();
    }
  }, [activeTab, loadPublicRooms]);

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
      showToast('Room created successfully!', 'success');
      navigate(`/room/${room.slug}`);
    } catch (err) {
      console.error('Failed to create room:', err);
      showToast('Failed to create room', 'danger');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRoom = async (slug: string) => {
    if (!confirm('Delete this room? This cannot be undone.')) return;
    try {
      await api.rooms.delete(slug);
      setRooms((prev) => prev.filter((r) => r.slug !== slug));
      setPublicRooms((prev) => prev.filter((r) => r.slug !== slug));
      showToast('Room deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete room:', err);
      showToast('Failed to delete room', 'danger');
    }
  };

  const handleCopyLink = async (slug: string) => {
    const url = `${window.location.origin}/room/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
    showToast('Invite link copied!', 'success');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'danger');
      return;
    }

    setIsSavingProfile(true);
    try {
      const body: Record<string, string> = {
        displayName: displayName.trim(),
        avatarColor,
        bio: bio.trim(),
      };

      if (newPassword) {
        body.newPassword = newPassword;
        body.currentPassword = currentPassword;
      }

      const res = await api.auth.updateProfile(body);

      updateUser(res.user);
      showToast('Profile updated successfully!', 'success');
      
      // Reset password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      showToast(msg, 'danger');
    } finally {
      setIsSavingProfile(false);
    }
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
          
          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'my-rooms' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('my-rooms')}
            >
              <UserIcon size={14} style={{ display: 'inline', marginRight: 6 }} />
              My Rooms
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'explore' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('explore')}
            >
              <Compass size={14} style={{ display: 'inline', marginRight: 6 }} />
              Explore Public
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'profile' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <Settings size={14} style={{ display: 'inline', marginRight: 6 }} />
              Profile Settings
            </button>
          </div>

          {/* TAB 1: My Rooms */}
          {activeTab === 'my-rooms' && (
            <>
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
            </>
          )}

          {/* TAB 2: Explore Public Rooms */}
          {activeTab === 'explore' && (
            <>
              <div className={styles.pageHeader}>
                <div>
                  <h1 className={styles.pageTitle}>Explore Rooms</h1>
                  <p className={styles.pageSub}>
                    Browse public collaborative rooms created by other members of the community.
                  </p>
                </div>
              </div>

              {isLoadingPublic ? (
                <div className={styles.roomGrid}>
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className={`card ${styles.roomCard}`} style={{ gap: 'var(--space-4)' }}>
                      <div className={styles.roomCardTop}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                          <Skeleton width="60%" height={20} />
                          <Skeleton width="20%" height={16} />
                        </div>
                        <Skeleton width="40%" height={12} />
                      </div>
                      <Skeleton width="100%" height={32} />
                    </div>
                  ))}
                </div>
              ) : publicRooms.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <Globe size={32} />
                  </div>
                  <h2>No public rooms</h2>
                  <p>There are no public rooms currently available to join.</p>
                </div>
              ) : (
                <div className={styles.roomGrid}>
                  {publicRooms.map((room) => (
                    <div key={room.id} className={`card ${styles.roomCard}`}>
                      <div className={styles.roomCardTop}>
                        <div className={styles.roomCardHeader}>
                          <h3 className={styles.roomName}>{room.name}</h3>
                          <div className={styles.roomBadge}>
                            <span className="badge badge-success">
                              <Globe size={10} /> Public
                            </span>
                          </div>
                        </div>

                        <div className={styles.roomMeta} style={{ flexDirection: 'column', gap: 'var(--space-1-5)' }}>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-2)' }}>
                            Owner: <strong>{room.owner.displayName}</strong>
                          </span>
                          <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: '2px' }}>
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
                      </div>

                      <div className={styles.roomCardActions}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => navigate(`/room/${room.slug}`)}
                        >
                          Join & Open
                        </button>
                        {room.owner.id === user?.id && (
                          <button
                            className="btn btn-danger btn-sm btn-icon"
                            onClick={() => handleDeleteRoom(room.slug)}
                            title="Delete room"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 3: Profile Settings */}
          {activeTab === 'profile' && (
            <>
              <div className={styles.pageHeader} style={{ justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <h1 className={styles.pageTitle}>Profile Settings</h1>
                  <p className={styles.pageSub}>
                    Customize your display details, choose an avatar color and change your password.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className={styles.profileForm}>
                
                <div className={styles.formSectionTitle}>Personal details</div>

                {/* Swatches */}
                <div className={styles.profileFormGroup}>
                  <label className="label">Avatar Color</label>
                  <div className={styles.avatarSwatches}>
                    {SWATCHES.map((color) => (
                      <button
                        type="button"
                        key={color}
                        className={`${styles.avatarSwatch} ${avatarColor === color ? styles.avatarSwatchActive : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setAvatarColor(color)}
                      />
                    ))}
                  </div>
                </div>

                {/* Display Name */}
                <div className={styles.profileFormGroup}>
                  <label className="label" htmlFor="display-name">Display Name</label>
                  <input
                    id="display-name"
                    type="text"
                    required
                    maxLength={32}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input"
                    placeholder="Enter display name"
                  />
                </div>

                {/* Bio */}
                <div className={styles.profileFormGroup}>
                  <label className="label" htmlFor="user-bio">Bio / Status</label>
                  <textarea
                    id="user-bio"
                    maxLength={200}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className={`input ${styles.bioTextarea}`}
                    placeholder="Tell other members about yourself..."
                  />
                </div>

                <div className={styles.formSectionTitle} style={{ marginTop: 'var(--space-4)' }}>Security settings</div>

                {/* Passwords */}
                <div className={styles.profileFormGroup}>
                  <label className="label" htmlFor="current-pwd">Current Password</label>
                  <input
                    id="current-pwd"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input"
                    placeholder="Required only to change password"
                  />
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-4)', width: '100%', flexWrap: 'wrap' }}>
                  <div className={styles.profileFormGroup} style={{ flex: 1, minWidth: 200 }}>
                    <label className="label" htmlFor="new-pwd">New Password</label>
                    <input
                      id="new-pwd"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <div className={styles.profileFormGroup} style={{ flex: 1, minWidth: 200 }}>
                    <label className="label" htmlFor="confirm-pwd">Confirm New Password</label>
                    <input
                      id="confirm-pwd"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input"
                      placeholder="Re-type new password"
                    />
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-end', marginTop: 'var(--space-4)', width: '100%', maxWidth: 160 }}
                >
                  {isSavingProfile ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Changes'}
                </button>
              </form>
            </>
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
