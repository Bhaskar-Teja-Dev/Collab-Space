import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Layers, StickyNote, Code2 } from 'lucide-react';
import { api } from '../lib/api';
import { usePresence } from '../hooks/usePresence';
import { useRoomStore } from '../store/room';
import { useAuthStore } from '../store/auth';
import PresenceBar from '../components/presence/PresenceBar';
import CursorOverlay from '../components/presence/CursorOverlay';
import DocEditor from '../components/editor/DocEditor';
import Whiteboard from '../components/whiteboard/Whiteboard';
import NotesBoard from '../components/notes/NotesBoard';
import CodeEditor from '../components/code/CodeEditor';
import styles from './Room.module.css';

type Module = 'doc' | 'whiteboard' | 'notes' | 'code';

const MODULE_LABELS: Record<Module, { label: string; icon: React.ReactNode }> = {
  doc:        { label: 'Document',   icon: <FileText size={15} /> },
  whiteboard: { label: 'Whiteboard', icon: <Layers size={15} /> },
  notes:      { label: 'Notes',      icon: <StickyNote size={15} /> },
  code:       { label: 'Code',       icon: <Code2 size={15} /> },
};

interface RoomData {
  id: string;
  name: string;
  slug: string;
  documents: Array<{ id: string; title: string; version: number }>;
}

export default function Room() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const setRoom = useRoomStore((s) => s.setRoom);
  const clearRoom = useRoomStore((s) => s.clearRoom);
  const activeModule = useRoomStore((s) => s.activeModule);
  const setActiveModule = useRoomStore((s) => s.setActiveModule);
  const presenceUsers = useRoomStore((s) => s.presenceUsers);

  const [room, setRoomData] = useState<RoomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Use presence hook — joins room via socket on mount, leaves on unmount
  const { broadcastCursor } = usePresence(room?.id ?? null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load room data from REST
  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        const { room: data } = await api.rooms.get(slug);
        setRoomData(data);
        setRoom(data.id, data.slug, data.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load room');
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      clearRoom();
    };
  }, [slug, setRoom, clearRoom]);

  // Broadcast cursor position on mouse move over the room container
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      broadcastCursor({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    },
    [broadcastCursor]
  );

  // Render module content
  const renderModule = () => {
    const docId = room?.documents?.[0]?.id;

    switch (activeModule) {
      case 'doc':
        return <DocEditor roomId={room?.id ?? null} documentId={docId ?? null} />;
      case 'whiteboard':
        return <Whiteboard roomId={room?.id ?? null} />;
      case 'notes':
        return <NotesBoard roomId={room?.id ?? null} />;
      case 'code':
        return <CodeEditor roomId={room?.id ?? null} />;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
        <p style={{ color: 'var(--color-text-2)', marginTop: 'var(--space-4)' }}>
          Joining room…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centered}>
        <h2 style={{ marginBottom: 'var(--space-3)' }}>Couldn't join room</h2>
        <p style={{ color: 'var(--color-text-2)', marginBottom: 'var(--space-6)' }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <div className={styles.logoMark}>C</div>
        </div>

        {/* Module nav */}
        <nav className={styles.moduleNav} aria-label="Modules">
          {(Object.keys(MODULE_LABELS) as Module[]).map((mod) => (
            <button
              key={mod}
              className={`${styles.moduleBtn} ${activeModule === mod ? styles.moduleBtnActive : ''}`}
              onClick={() => setActiveModule(mod)}
              title={MODULE_LABELS[mod].label}
              id={`module-${mod}`}
              aria-pressed={activeModule === mod}
            >
              {MODULE_LABELS[mod].icon}
              <span className={styles.moduleBtnLabel}>{MODULE_LABELS[mod].label}</span>
            </button>
          ))}
        </nav>

        {/* Back to dashboard */}
        <div className={styles.sidebarBottom}>
          <button
            className={`btn btn-ghost btn-sm ${styles.backBtn}`}
            onClick={() => navigate('/dashboard')}
            title="Dashboard"
            id="back-to-dashboard"
          >
            <ArrowLeft size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className={styles.main}>
        {/* Top bar */}
        <header className={styles.topBar}>
          <div className={styles.roomTitle}>
            <h1 className={styles.roomName}>{room?.name}</h1>
            <span className={styles.moduleLabel}>
              {MODULE_LABELS[activeModule].label}
            </span>
          </div>

          {/* Presence bar */}
          <PresenceBar users={presenceUsers} currentUserId={user?.id ?? ''} />
        </header>

        {/* Content area with cursor tracking */}
        <div
          ref={containerRef}
          className={styles.contentArea}
          onMouseMove={handleMouseMove}
        >
          {/* Remote cursors overlay */}
          <CursorOverlay
            users={presenceUsers}
            currentUserId={user?.id ?? ''}
            containerRef={containerRef}
          />

          {/* Module content */}
          {renderModule()}
        </div>
      </div>
    </div>
  );
}
