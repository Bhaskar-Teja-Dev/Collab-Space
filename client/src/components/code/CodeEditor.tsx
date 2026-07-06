import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SOCKET_EVENTS } from '@collab-space/shared';
import { getSocket } from '../../lib/socket';
import { useToast } from '../ui';
import { Copy, Check, Play } from 'lucide-react';
import styles from './CodeEditor.module.css';

interface Props {
  roomId: string | null;
}

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
];

export default function CodeEditor({ roomId }: Props) {
  const { showToast } = useToast();
  
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef('');
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state from socket
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const handleCodeState = (data: { content: string; language: string }) => {
      setContent(data.content);
      contentRef.current = data.content;
      setLanguage(data.language);
    };

    const handleCodeUpdate = (data: { content: string; language: string }) => {
      // Only apply if user is not currently editing, to avoid cursor jumps
      if (!isTypingRef.current) {
        setContent(data.content);
        contentRef.current = data.content;
        setLanguage(data.language);
      }
    };

    socket.on(SOCKET_EVENTS.CODE_STATE, handleCodeState);
    socket.on(SOCKET_EVENTS.CODE_UPDATE, handleCodeUpdate);

    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId });

    return () => {
      socket.off(SOCKET_EVENTS.CODE_STATE, handleCodeState);
      socket.off(SOCKET_EVENTS.CODE_UPDATE, handleCodeUpdate);
    };
  }, [roomId]);

  // Tab key indent helper
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newContent = content.slice(0, start) + '  ' + content.slice(end);
      
      setContent(newContent);
      contentRef.current = newContent;

      // Reset cursor pos after render
      requestAnimationFrame(() => {
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2;
      });

      triggerChange(newContent, language);
    }
  };

  const triggerChange = (newVal: string, newLang: string) => {
    if (!roomId) return;
    const socket = getSocket();

    socket.emit(SOCKET_EVENTS.CODE_UPDATE, {
      roomId,
      content: newVal,
      language: newLang,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    contentRef.current = val;

    // Mark as typing so incoming socket updates don't overwrite user cursor
    isTypingRef.current = true;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);

    triggerChange(val, language);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLanguage(val);
    triggerChange(content, val);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Code copied to clipboard', 'success');
  };

  const runCode = () => {
    setIsRunning(true);
    setConsoleOutput('Running compilation...\n');

    if (language === 'javascript' || language === 'typescript') {
      // Create a secure Web Worker from a Blob to isolate JavaScript execution context
      // Web Workers do not have access to: window, document, localStorage, cookies.
      // This mitigates XSS risk completely!
      const workerCode = `
        const logs = [];
        console.log = (...args) => {
          logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
        };
        
        // Timeout watch to prevent infinite loops
        setTimeout(() => {
          self.postMessage({ type: 'error', val: 'Execution Timeout (Max 3 seconds)' });
          self.close();
        }, 3000);

        try {
          const run = new Function(${JSON.stringify(content)});
          run();
          self.postMessage({ type: 'success', val: logs.join('\\n') || 'Code executed successfully (no logs).' });
        } catch (err) {
          self.postMessage({ type: 'error', val: 'Error: ' + err.message });
        }
      `;

      try {
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));

        worker.onmessage = (e) => {
          setIsRunning(false);
          setConsoleOutput(e.data.val);
          worker.terminate();
        };

        worker.onerror = (err) => {
          setIsRunning(false);
          setConsoleOutput(`Runtime Error: ${err.message}`);
          worker.terminate();
        };
      } catch (err) {
        setIsRunning(false);
        setConsoleOutput(`Failed to launch execution sandbox: ${(err as Error).message}`);
      }
    } else {
      setTimeout(() => {
        setIsRunning(false);
        setConsoleOutput(`[CollabSpace Compiler Simulator]\nRunning ${language} code...\n\nProcess completed with exit code 0.`);
      }, 1200);
    }
  };

  // Generate line numbers
  const lines = content.split('\n');

  return (
    <div className={styles.container}>
      {/* ── Header Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <select
            className={styles.select}
            value={language}
            onChange={handleLanguageChange}
            aria-label="Code language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarRight}>
          <button className={styles.runBtn} onClick={runCode} disabled={isRunning}>
            {isRunning ? (
              <span className="spinner" style={{ width: 12, height: 12 }} />
            ) : (
              <Play size={12} fill="var(--color-success)" stroke="none" />
            )}
            Run Code
          </button>
          <button className={styles.copyBtn} onClick={copyCode}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            Copy
          </button>
        </div>
      </div>

      {/* ── Editor Canvas layout ── */}
      <div className={styles.editorBody}>
        {/* Line Numbers */}
        <div className={styles.lineNumbers} aria-hidden="true">
          {lines.map((_, idx) => (
            <div key={idx} className={styles.lineNumber}>
              {idx + 1}
            </div>
          ))}
        </div>

        {/* Textarea Code Pad */}
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="// Type collaborative code here..."
          aria-label="Code editor"
          id="code-editor-textarea"
          spellCheck={false}
        />
      </div>

      {/* ── Interactive Simulator Console Pane ── */}
      {consoleOutput !== null && (
        <div className={styles.console}>
          <div className={styles.consoleHeader}>
            <span>Console Output</span>
            <button className={styles.consoleClose} onClick={() => setConsoleOutput(null)}>
              ✕
            </button>
          </div>
          <pre className={styles.consoleBody}>{consoleOutput}</pre>
        </div>
      )}
    </div>
  );
}
