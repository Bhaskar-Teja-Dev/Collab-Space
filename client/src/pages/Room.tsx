import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Layers, StickyNote, Code2, History, Globe, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { usePresence } from '../hooks/usePresence';
import { useRoomStore } from '../store/room';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/ui';
import PresenceBar from '../components/presence/PresenceBar';
import CursorOverlay from '../components/presence/CursorOverlay';
import DocEditor from '../components/editor/DocEditor';
import Whiteboard from '../components/whiteboard/Whiteboard';
import NotesBoard from '../components/notes/NotesBoard';
import CodeEditor from '../components/code/CodeEditor';
import VersionHistoryPanel from '../components/versions/VersionHistoryPanel';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '@collab-space/shared';
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
  ownerId: string;
  isPublic: boolean;
  documents: Array<{ id: string; title: string; version: number }>;
}

export default function Room() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const user = useAuthStore((s) => s.user);
  const setRoom = useRoomStore((s) => s.setRoom);
  const clearRoom = useRoomStore((s) => s.clearRoom);
  const activeModule = useRoomStore((s) => s.activeModule);
  const setActiveModule = useRoomStore((s) => s.setActiveModule);
  const presenceUsers = useRoomStore((s) => s.presenceUsers);

  const [room, setRoomData] = useState<RoomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Version panel state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentDocContent, setCurrentDocContent] = useState('');
  const [isFetchingDoc, setIsFetchingDoc] = useState(false);

  // Modules cache refs (for snapshots)
  const whiteboardRef = useRef<unknown[]>([]);
  const notesRef = useRef<unknown[]>([]);
  const codeContentRef = useRef('');
  const codeLangRef = useRef('javascript');

  const { broadcastCursor } = usePresence(room?.id ?? null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load room data
  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        const { room: data } = await api.rooms.get(slug);
        setRoomData(data);
        setIsPublic(data.isPublic);
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

  // Subscribe to real-time shapes, notes and code updates to cache current values
  useEffect(() => {
    if (!room?.id) return;
    const socket = getSocket();

    const handleWbState = (data: { shapes: any[] }) => { whiteboardRef.current = data.shapes; };
    const handleShapeAdd = (data: { shape: any }) => { whiteboardRef.current = [...whiteboardRef.current, data.shape]; };
    const handleShapeUpdate = (data: { shape: any }) => { whiteboardRef.current = whiteboardRef.current.map((s: any) => s.id === data.shape.id ? data.shape : s); };
    const handleShapeDelete = (data: { shapeId: string }) => { whiteboardRef.current = whiteboardRef.current.filter((s: any) => s.id !== data.shapeId); };

    const handleNotesState = (data: { notes: any[] }) => { notesRef.current = data.notes; };
    const handleNoteCreate = (data: { note: any }) => { notesRef.current = [...notesRef.current, data.note]; };
    const handleNoteUpdate = (data: { noteId: string; content: string }) => { notesRef.current = notesRef.current.map((n: any) => n.id === data.noteId ? { ...n, content: data.content } : n); };
    const handleNoteDelete = (data: { noteId: string }) => { notesRef.current = notesRef.current.filter((n: any) => n.id !== data.noteId); };
    const handleNoteMove = (data: { noteId: string; x: number; y: number }) => { notesRef.current = notesRef.current.map((n: any) => n.id === data.noteId ? { ...n, x: data.x, y: data.y } : n); };

    const handleCodeState = (data: { content: string; language: string }) => {
      codeContentRef.current = data.content;
      codeLangRef.current = data.language;
    };
    const handleCodeUpdate = (data: { content: string; language: string }) => {
      codeContentRef.current = data.content;
      codeLangRef.current = data.language;
    };

    socket.on(SOCKET_EVENTS.WB_STATE, handleWbState);
    socket.on(SOCKET_EVENTS.SHAPE_ADD, handleShapeAdd);
    socket.on(SOCKET_EVENTS.SHAPE_UPDATE, handleShapeUpdate);
    socket.on(SOCKET_EVENTS.SHAPE_DELETE, handleShapeDelete);

    socket.on(SOCKET_EVENTS.NOTES_STATE, handleNotesState);
    socket.on(SOCKET_EVENTS.NOTE_CREATE, handleNoteCreate);
    socket.on(SOCKET_EVENTS.NOTE_UPDATE, handleNoteUpdate);
    socket.on(SOCKET_EVENTS.NOTE_DELETE, handleNoteDelete);
    socket.on(SOCKET_EVENTS.NOTE_MOVE, handleNoteMove);

    socket.on(SOCKET_EVENTS.CODE_STATE, handleCodeState);
    socket.on(SOCKET_EVENTS.CODE_UPDATE, handleCodeUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.WB_STATE, handleWbState);
      socket.off(SOCKET_EVENTS.SHAPE_ADD, handleShapeAdd);
      socket.off(SOCKET_EVENTS.SHAPE_UPDATE, handleShapeUpdate);
      socket.off(SOCKET_EVENTS.SHAPE_DELETE, handleShapeDelete);

      socket.off(SOCKET_EVENTS.NOTES_STATE, handleNotesState);
      socket.off(SOCKET_EVENTS.NOTE_CREATE, handleNoteCreate);
      socket.off(SOCKET_EVENTS.NOTE_UPDATE, handleNoteUpdate);
      socket.off(SOCKET_EVENTS.NOTE_DELETE, handleNoteDelete);
      socket.off(SOCKET_EVENTS.NOTE_MOVE, handleNoteMove);

      socket.off(SOCKET_EVENTS.CODE_STATE, handleCodeState);
      socket.off(SOCKET_EVENTS.CODE_UPDATE, handleCodeUpdate);
    };
  }, [room?.id]);

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

  const handleTogglePrivacy = async () => {
    if (!room) return;
    try {
      const res = await api.rooms.togglePrivacy(room.slug);
      setIsPublic(res.isPublic);
      showToast(`Room is now ${res.isPublic ? 'Public' : 'Private'}`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to toggle room privacy', 'danger');
    }
  };

  const handleOpenHistory = async () => {
    const docId = room?.documents?.[0]?.id;
    if (!docId) return;
    setIsFetchingDoc(true);
    try {
      const res = await api.documents.get(docId);
      setCurrentDocContent(res.document.content);
      setHistoryOpen(true);
    } catch (err) {
      console.error(err);
      showToast('Failed to load current document content', 'danger');
    } finally {
      setIsFetchingDoc(false);
    }
  };

  const handleRevertSuccess = (reverted: {
    docContent: string;
    whiteboard: string;
    notes: string;
    codeContent: string;
    codeLang: string;
  }) => {
    const socket = getSocket();
    if (!room?.id) return;

    // 1. Delete all current whiteboard shapes, then add reverted
    whiteboardRef.current.forEach((s: any) => {
      socket.emit(SOCKET_EVENTS.SHAPE_DELETE, { roomId: room.id, shapeId: s.id });
    });
    try {
      const revWb = JSON.parse(reverted.whiteboard) as any[];
      revWb.forEach((s: any) => {
        socket.emit(SOCKET_EVENTS.SHAPE_ADD, { roomId: room.id, shape: s });
      });
      whiteboardRef.current = revWb;
    } catch (err) { console.error(err); }

    // 2. Delete all current notes, then add reverted
    notesRef.current.forEach((n: any) => {
      socket.emit(SOCKET_EVENTS.NOTE_DELETE, { roomId: room.id, noteId: n.id });
    });
    try {
      const revNotes = JSON.parse(reverted.notes) as any[];
      revNotes.forEach((n: any) => {
        socket.emit(SOCKET_EVENTS.NOTE_CREATE, { roomId: room.id, note: n });
      });
      notesRef.current = revNotes;
    } catch (err) { console.error(err); }

    // 3. Update code content
    socket.emit(SOCKET_EVENTS.CODE_UPDATE, {
      roomId: room.id,
      content: reverted.codeContent,
      language: reverted.codeLang,
    });
    codeContentRef.current = reverted.codeContent;
    codeLangRef.current = reverted.codeLang;

    showToast('Restored all modules successfully!', 'success');
  };

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

  const isOwner = room?.ownerId === user?.id;

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoMark}>C</div>
        </div>

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
            
            {/* Privacy Badge */}
            <span className={`${styles.privacyBadge} ${isPublic ? styles.privacyPublic : styles.privacyPrivate}`}>
              {isPublic ? (
                <>
                  <Globe size={11} style={{ marginRight: 2 }} />
                  Public
                </>
              ) : (
                <>
                  <Lock size={11} style={{ marginRight: 2 }} />
                  Private
                </>
              )}
            </span>

            {isOwner && (
              <button onClick={handleTogglePrivacy} className={styles.changeBtn}>
                Change
              </button>
            )}

            <span className={styles.moduleLabel}>
              {MODULE_LABELS[activeModule].label}
            </span>
          </div>

          <div className={styles.topBarRight}>
            <PresenceBar users={presenceUsers} currentUserId={user?.id ?? ''} />
            
            <button 
              className={styles.historyBtn} 
              onClick={handleOpenHistory}
              disabled={isFetchingDoc}
            >
              {isFetchingDoc ? (
                <span className="spinner" style={{ width: 12, height: 12 }} />
              ) : (
                <History size={13} />
              )}
              History
            </button>
          </div>
        </header>

        {/* Content area with cursor tracking */}
        <div
          ref={containerRef}
          className={styles.contentArea}
          onMouseMove={handleMouseMove}
        >
          <CursorOverlay
            users={presenceUsers}
            currentUserId={user?.id ?? ''}
            containerRef={containerRef}
          />

          {renderModule()}
        </div>
      </div>

      <VersionHistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        roomId={room?.id ?? ''}
        docContent={currentDocContent}
        whiteboard={whiteboardRef.current}
        notes={notesRef.current}
        codeContent={codeContentRef.current}
        codeLang={codeLangRef.current}
        onRevertSuccess={handleRevertSuccess}
      />
    </div>
  );
}
