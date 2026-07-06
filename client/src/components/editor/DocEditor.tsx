import { useEffect, useRef, useState, useCallback } from 'react';
import { SOCKET_EVENTS, type Operation, type OperationAck } from '@collab-space/shared';
import { applyOp } from '@collab-space/shared';
import { getSocket } from '../../lib/socket';
import { OTClient, diffToOp } from '../../lib/ot-client';
import styles from './DocEditor.module.css';

interface Props {
  roomId: string | null;
  documentId: string | null;
}

// Word count helper
function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function DocEditor({ roomId, documentId }: Props) {
  const [content, setContent] = useState('');
  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [isSyncing, setIsSyncing] = useState(false);

  // Refs to avoid stale closures in socket handlers
  const contentRef = useRef('');
  const otClientRef = useRef<OTClient>(new OTClient());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep contentRef in sync
  const updateContent = useCallback((val: string) => {
    contentRef.current = val;
    setContent(val);
  }, []);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  // Socket effects
  useEffect(() => {
    if (!documentId) return;

    const socket = getSocket();
    const otClient = otClientRef.current;

    // Initial document snapshot
    const handleDocState = (data: {
      documentId: string;
      content: string;
      version: number;
    }) => {
      if (data.documentId !== documentId) return;
      otClient.version = data.version;
      updateContent(data.content);
      // Extract title from first line (convention)
      const lines = data.content.split('\n');
      if (lines[0]?.startsWith('# ')) {
        setDocTitle(lines[0].slice(2).trim() || 'Untitled Document');
      }
      setTimeout(autoResize, 0);
    };

    // Remote op — apply to local content
    const handleOpBroadcast = (data: {
      documentId: string;
      operation: Operation;
      version: number;
    }) => {
      if (data.documentId !== documentId) return;
      // Transform against pending if any
      const opToApply = otClient.handleBroadcast(data.operation);
      const newContent = applyOp(contentRef.current, opToApply);
      otClient.version = data.version;
      updateContent(newContent);
      setTimeout(autoResize, 0);
    };

    // ACK from server
    const handleOpAck = (ack: OperationAck) => {
      if (ack.documentId !== documentId) return;
      otClient.handleAck(ack, roomId ?? '', documentId, socket);
      // Clear syncing after a brief visual delay
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => setIsSyncing(false), 400);
    };

    socket.on(SOCKET_EVENTS.DOC_STATE, handleDocState);
    socket.on(SOCKET_EVENTS.OP_BROADCAST, handleOpBroadcast);
    socket.on(SOCKET_EVENTS.OP_ACK, handleOpAck);

    return () => {
      socket.off(SOCKET_EVENTS.DOC_STATE, handleDocState);
      socket.off(SOCKET_EVENTS.OP_BROADCAST, handleOpBroadcast);
      socket.off(SOCKET_EVENTS.OP_ACK, handleOpAck);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [roomId, documentId, updateContent, autoResize]);

  // Process local edits sequentially to handle replacements (delete then insert)
  const processNextPendingOp = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || !roomId || !documentId) return;
    const newVal = ta.value;
    const oldVal = contentRef.current;
    if (newVal === oldVal) return;

    const op = diffToOp(oldVal, newVal);
    if (op) {
      const nextLocalState = applyOp(oldVal, op);
      updateContent(nextLocalState);

      const socket = getSocket();
      setIsSyncing(true);
      otClientRef.current.submit(op, roomId, documentId, socket);

      // If additional diff remains (e.g. an insert following a delete), schedule next check
      if (ta.value !== nextLocalState) {
        setTimeout(processNextPendingOp, 50);
      }
    }
  }, [roomId, documentId, updateContent]);

  // Handle textarea changes — trigger the diff processor loop
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      autoResize();
      processNextPendingOp();
    },
    [autoResize, processNextPendingOp]
  );

  // Toolbar: insert markdown syntax at cursor position
  const insertAtCursor = useCallback(
    (before: string, after: string = '') => {
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = content.slice(start, end);
      const newContent =
        content.slice(0, start) + before + selected + after + content.slice(end);

      // Set value on raw element to trigger diff calculation
      ta.value = newContent;
      autoResize();

      // Restore cursor position
      requestAnimationFrame(() => {
        ta.selectionStart = start + before.length;
        ta.selectionEnd = end + before.length;
        ta.focus();
      });

      processNextPendingOp();
    },
    [content, autoResize, processNextPendingOp]
  );

  const insertLinePrefix = useCallback(
    (prefix: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      const newContent = content.slice(0, lineStart) + prefix + content.slice(lineStart);
      
      ta.value = newContent;
      autoResize();
      
      requestAnimationFrame(() => {
        ta.selectionStart = start + prefix.length;
        ta.selectionEnd = ta.selectionStart;
        ta.focus();
      });

      processNextPendingOp();
    },
    [content, autoResize, processNextPendingOp]
  );

  const version = otClientRef.current.version;
  const words = countWords(content);

  if (!documentId) {
    return (
      <div className={styles.editorRoot}>
        <div className={styles.noDoc}>
          <div className={styles.noDocIcon}>📄</div>
          <p>No document available for this room yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editorRoot}>
      {/* ── Status bar ── */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <input
            className={styles.docTitleInput}
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Untitled Document"
            aria-label="Document title"
            id="doc-title-input"
          />
          <span className={styles.versionBadge}>v{version}</span>
        </div>
        <div className={styles.statusRight}>
          <span className={styles.wordCount}>{words} word{words !== 1 ? 's' : ''}</span>
          <div className={`${styles.syncStatus} ${isSyncing ? styles.syncing : styles.saved}`}>
            {isSyncing ? (
              <>
                <span className="spinner" style={{ width: 10, height: 10 }} />
                Syncing…
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="5" fill="var(--color-success)" opacity="0.2"/>
                  <path d="M2.5 5l2 2 3-3" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Saved
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <button
          className={`${styles.toolbarBtn}`}
          onClick={() => insertAtCursor('**', '**')}
          title="Bold (Ctrl+B)"
          type="button"
          aria-label="Bold"
        >
          B
        </button>
        <button
          className={styles.toolbarBtn}
          onClick={() => insertAtCursor('*', '*')}
          title="Italic (Ctrl+I)"
          type="button"
          aria-label="Italic"
          style={{ fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}
        >
          I
        </button>
        <button
          className={`${styles.toolbarBtn} ${styles.wide}`}
          onClick={() => insertLinePrefix('# ')}
          title="Heading 1"
          type="button"
          aria-label="Heading"
          style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}
        >
          H1
        </button>
        <button
          className={`${styles.toolbarBtn} ${styles.wide}`}
          onClick={() => insertLinePrefix('## ')}
          title="Heading 2"
          type="button"
          aria-label="Heading 2"
          style={{ fontFamily: 'var(--font-sans)', fontWeight: 600 }}
        >
          H2
        </button>
        <div className={styles.toolbarDivider} />
        <button
          className={styles.toolbarBtn}
          onClick={() => insertAtCursor('`', '`')}
          title="Inline code"
          type="button"
          aria-label="Code"
        >
          {'<>'}
        </button>
        <button
          className={`${styles.toolbarBtn} ${styles.wide}`}
          onClick={() => insertLinePrefix('- ')}
          title="Bullet list"
          type="button"
          aria-label="Bullet"
        >
          •
        </button>
        <button
          className={`${styles.toolbarBtn} ${styles.wide}`}
          onClick={() => insertLinePrefix('> ')}
          title="Blockquote"
          type="button"
          aria-label="Blockquote"
        >
          "
        </button>
        <div className={styles.toolbarDivider} />
        <button
          className={`${styles.toolbarBtn} ${styles.wide}`}
          onClick={() => {
            const ta = textareaRef.current;
            if (!ta) return;
            const pos = ta.selectionStart;
            const newContent = content.slice(0, pos) + '\n---\n' + content.slice(pos);
            
            ta.value = newContent;
            autoResize();
            ta.focus();
            
            processNextPendingOp();
          }}
          title="Horizontal rule"
          type="button"
          aria-label="Horizontal rule"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          ─
        </button>
      </div>

      {/* ── Page canvas ── */}
      <div className={styles.pageCanvas}>
        <div className={styles.page}>
          <input
            className={styles.pageTitleInput}
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Document title…"
            aria-label="Page title"
            id="page-title-input"
          />
          <div className={styles.pageDivider} />
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={content}
            onChange={handleChange}
            placeholder="Start writing… Markdown is supported."
            aria-label="Document body"
            id="doc-editor-textarea"
            spellCheck
            rows={30}
          />
        </div>
      </div>
    </div>
  );
}
