/**
 * DocEditorStub — Phase 2 placeholder.
 *
 * This component shows a working text editor UI but is not yet wired to the
 * OT sync engine. It demonstrates the layout and explains what Phase 2 will
 * implement to anyone looking at the project.
 *
 * To implement Phase 2:
 *  1. Install Tiptap: npm install @tiptap/react @tiptap/pm @tiptap/starter-kit
 *  2. Replace the <textarea> with a Tiptap Editor instance
 *  3. On each content change, generate an OT Operation from the diff
 *  4. Send it via socket.emit(SOCKET_EVENTS.OP_SUBMIT, ...)
 *  5. On socket.on(SOCKET_EVENTS.OP_BROADCAST, ...), apply the remote op
 *  6. On socket.on(SOCKET_EVENTS.OP_ACK, ...), clear pending op from queue
 */
import { useState, useEffect } from 'react';
import { SOCKET_EVENTS } from '@collab-space/shared';
import { getSocket } from '../../lib/socket';
import styles from './DocEditorStub.module.css';

interface Props {
  roomId: string | null;
  documentId: string | null;
}

export default function DocEditorStub({ roomId, documentId }: Props) {
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Listen for the initial document snapshot
  useEffect(() => {
    if (!documentId) return;

    const socket = getSocket();

    const handleDocState = (data: { documentId: string; content: string; version: number }) => {
      if (data.documentId !== documentId) return;
      setContent(data.content);
      setVersion(data.version);
    };

    const handleOpBroadcast = (data: { version: number; operation: any }) => {
      // TODO Phase 2: apply the incoming operation to content using applyOp()
      // For now just track the version bump
      setVersion(data.version);
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 300);
    };

    socket.on(SOCKET_EVENTS.DOC_STATE, handleDocState);
    socket.on(SOCKET_EVENTS.OP_BROADCAST, handleOpBroadcast);

    return () => {
      socket.off(SOCKET_EVENTS.DOC_STATE, handleDocState);
      socket.off(SOCKET_EVENTS.OP_BROADCAST, handleOpBroadcast);
    };
  }, [documentId]);

  return (
    <div className={styles.editor}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.docTitle}>Untitled Document</span>
        </div>
        <div className={styles.toolbarRight}>
          {isSyncing && (
            <div className={styles.syncIndicator}>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              <span>Syncing…</span>
            </div>
          )}
          {!isSyncing && (
            <span className={styles.savedIndicator}>✓ Saved · v{version}</span>
          )}
        </div>
      </div>

      {/* Phase 2 notice */}
      <div className={styles.phase2Notice}>
        <div className={styles.phase2Icon}>⚡</div>
        <div>
          <strong>Phase 2 — OT Document Editor</strong>
          <p>
            The OT sync engine (transform, apply, broadcast) is wired up on the server.
            Next step: replace this textarea with Tiptap and connect the OT client hooks.
          </p>
        </div>
      </div>

      {/* Editor area */}
      <div className={styles.editorArea}>
        <textarea
          className={styles.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing… (OT sync coming in Phase 2)"
          aria-label="Document editor"
          id="doc-editor-textarea"
          spellCheck
        />
      </div>

      {/* Status bar */}
      <div className={styles.statusBar}>
        <span>Document ID: {documentId ?? '—'}</span>
        <span>{content.length} chars</span>
        <span>Room: {roomId ?? '—'}</span>
      </div>
    </div>
  );
}
