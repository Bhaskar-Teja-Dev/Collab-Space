import React, { useState, useEffect, useRef } from 'react';
import { SOCKET_EVENTS } from '@collab-space/shared';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/auth';
import { useToast } from '../ui';
import { Plus, Trash2 } from 'lucide-react';
import styles from './NotesBoard.module.css';

type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

interface Note {
  id: string;
  content: string;
  color: NoteColor;
  x: number;
  y: number;
  width: number;
  authorId: string;
  authorName: string;
  createdAt: string;
}

interface Props {
  roomId: string | null;
}

const COLOR_MAP: Record<NoteColor, { bg: string; border: string; text: string; header: string }> = {
  yellow: { bg: '#fef3c7', border: '#fcd34d', text: '#78350f', header: '#fbbf24' },
  blue:   { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a', header: '#60a5fa' },
  green:  { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46', header: '#34d399' },
  pink:   { bg: '#fce7f3', border: '#fbcfe8', text: '#831843', header: '#f472b6' },
  purple: { bg: '#f3e8ff', border: '#d8b4fe', text: '#581c87', header: '#a78bfa' },
};

export default function NotesBoard({ roomId }: Props) {
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  
  // Drag states
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Sync notes from socket
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const handleNotesState = (data: { notes: Note[] }) => {
      setNotes(data.notes);
    };

    const handleNoteCreate = (data: { note: Note }) => {
      setNotes((prev) => [...prev, data.note]);
    };

    const handleNoteUpdate = (data: { noteId: string; content: string }) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === data.noteId ? { ...n, content: data.content } : n))
      );
    };

    const handleNoteDelete = (data: { noteId: string }) => {
      setNotes((prev) => prev.filter((n) => n.id !== data.noteId));
    };

    const handleNoteMove = (data: { noteId: string; x: number; y: number }) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === data.noteId ? { ...n, x: data.x, y: data.y } : n))
      );
    };

    socket.on(SOCKET_EVENTS.NOTES_STATE, handleNotesState);
    socket.on(SOCKET_EVENTS.NOTE_CREATE, handleNoteCreate);
    socket.on(SOCKET_EVENTS.NOTE_UPDATE, handleNoteUpdate);
    socket.on(SOCKET_EVENTS.NOTE_DELETE, handleNoteDelete);
    socket.on(SOCKET_EVENTS.NOTE_MOVE, handleNoteMove);

    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId });

    return () => {
      socket.off(SOCKET_EVENTS.NOTES_STATE, handleNotesState);
      socket.off(SOCKET_EVENTS.NOTE_CREATE, handleNoteCreate);
      socket.off(SOCKET_EVENTS.NOTE_UPDATE, handleNoteUpdate);
      socket.off(SOCKET_EVENTS.NOTE_DELETE, handleNoteDelete);
      socket.off(SOCKET_EVENTS.NOTE_MOVE, handleNoteMove);
    };
  }, [roomId]);

  const addNote = (color: NoteColor) => {
    if (!roomId) return;
    const socket = getSocket();

    const board = boardRef.current;
    const x = board ? Math.random() * (board.clientWidth - 260) + 20 : 100;
    const y = board ? Math.random() * (board.clientHeight - 260) + 20 : 100;

    const newNote: Note = {
      id: crypto.randomUUID(),
      content: '',
      color,
      x,
      y,
      width: 220,
      authorId: user?.id ?? '',
      authorName: user?.displayName ?? 'Anonymous',
      createdAt: new Date().toISOString(),
    };

    setNotes((prev) => [...prev, newNote]);
    socket.emit(SOCKET_EVENTS.NOTE_CREATE, { roomId, note: newNote });
  };

  const updateNoteContent = (noteId: string, val: string) => {
    if (!roomId) return;
    const socket = getSocket();

    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content: val } : n))
    );
    socket.emit(SOCKET_EVENTS.NOTE_UPDATE, { roomId, noteId, content: val });
  };

  const deleteNote = (noteId: string) => {
    if (!roomId) return;
    const socket = getSocket();

    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    socket.emit(SOCKET_EVENTS.NOTE_DELETE, { roomId, noteId });
    showToast('Note deleted', 'info');
  };

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    setActiveDragId(note.id);
    setDragOffset({
      x: e.clientX - note.x,
      y: e.clientY - note.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeDragId || !roomId) return;
    const socket = getSocket();

    const board = boardRef.current;
    if (!board) return;

    const rect = board.getBoundingClientRect();
    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    // Bounds checking
    newX = Math.max(10, Math.min(newX, board.clientWidth - 230));
    newY = Math.max(10, Math.min(newY, board.clientHeight - 230));

    setNotes((prev) =>
      prev.map((n) => (n.id === activeDragId ? { ...n, x: newX, y: newY } : n))
    );
    socket.emit(SOCKET_EVENTS.NOTE_MOVE, { roomId, noteId: activeDragId, x: newX, y: newY });
  };

  const handleDragEnd = () => {
    setActiveDragId(null);
  };

  return (
    <div
      ref={boardRef}
      className={styles.board}
      onMouseMove={handleMouseMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      {/* ── Background Grid Pattern ── */}
      <div className={styles.gridOverlay} />

      {/* ── Sticky Notes list ── */}
      {notes.map((note) => {
        const theme = COLOR_MAP[note.color];
        return (
          <div
            key={note.id}
            className={`${styles.note} ${activeDragId === note.id ? styles.dragging : ''}`}
            style={{
              left: note.x,
              top: note.y,
              width: note.width,
              backgroundColor: theme.bg,
              borderColor: theme.border,
              color: theme.text,
            }}
          >
            {/* Header / Drag Handle */}
            <div
              className={styles.noteHeader}
              onMouseDown={(e) => handleDragStart(e, note)}
              style={{ backgroundColor: theme.header }}
            >
              <span className={styles.author}>{note.authorName}</span>
              <button
                className={styles.deleteBtn}
                onClick={() => deleteNote(note.id)}
                title="Delete note"
                style={{ color: theme.text }}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* Note Textarea */}
            <textarea
              className={styles.noteBody}
              value={note.content}
              onChange={(e) => updateNoteContent(note.id, e.target.value)}
              placeholder="Write a note…"
              style={{ color: theme.text }}
            />
          </div>
        );
      })}

      {notes.length === 0 && (
        <div className={styles.emptyState}>
          <h3>Sticky Notes Board</h3>
          <p>Click any color below to add your first note to the board.</p>
        </div>
      )}

      {/* ── Add Note Fab Overlay ── */}
      <div className={styles.fabContainer}>
        <div className={styles.fabOptions}>
          {(Object.keys(COLOR_MAP) as NoteColor[]).map((col) => (
            <button
              key={col}
              className={styles.colorSelectBtn}
              style={{ backgroundColor: COLOR_MAP[col].header }}
              onClick={() => addNote(col)}
              title={`Add ${col} note`}
            />
          ))}
        </div>
        <button className={styles.fab} title="Create note">
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}
