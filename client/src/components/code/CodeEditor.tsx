import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SOCKET_EVENTS } from '@collab-space/shared';
import { getSocket } from '../../lib/socket';
import { useToast } from '../ui';
import { Copy, Check, Play, Undo, Redo, FileCode } from 'lucide-react';
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

const BOILERPLATES: Record<string, string> = {
  javascript: `// JavaScript Boilerplate\nconsole.log("Hello, World!");\n\nfunction add(a, b) {\n  return a + b;\n}\nconsole.log("2 + 3 =", add(2, 3));`,
  typescript: `// TypeScript Boilerplate\nconst greeting: string = "Hello, World!";\nconsole.log(greeting);\n\ninterface User {\n  id: number;\n  name: string;\n}\nconst user: User = { id: 1, name: "Alice" };\nconsole.log("User:", user);`,
  python: `# Python Boilerplate\ndef greet(name: str) -> None:\n    print(f"Hello, {name}!")\n\nif __name__ == "__main__":\n    greet("World")`,
  go: `// Go Boilerplate\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}`,
  rust: `// Rust Boilerplate\nfn main() {\n    println!("Hello, World!");\n}`,
  html: `<!-- HTML Boilerplate -->\n<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <title>Hello World</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>`,
  css: `/* CSS Boilerplate */\nbody {\n  margin: 0;\n  font-family: sans-serif;\n  background-color: #f0f0f0;\n  color: #333;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n}`,
  sql: `-- SQL Boilerplate\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  email VARCHAR(100) UNIQUE\n);\n\nINSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');\nSELECT * FROM users;`,
  json: `{\n  "message": "Hello, World!",\n  "status": "success",\n  "data": {\n    "id": 1,\n    "items": [1, 2, 3]\n  }\n}`,
  bash: `# Bash Boilerplate\n#!/bin/bash\necho "Hello, World!"\n\nNAME="Alice"\necho "Hello, $NAME!"`
};

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

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  // Sync state from socket
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const handleCodeState = (data: { content: string; language: string }) => {
      setContent(data.content);
      contentRef.current = data.content;
      setLanguage(data.language);
      undoStack.current = [];
      redoStack.current = [];
    };

    const handleCodeUpdate = (data: { content: string; language: string }) => {
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

  const triggerChange = useCallback((newVal: string, newLang: string) => {
    if (!roomId) return;
    const socket = getSocket();

    socket.emit(SOCKET_EVENTS.CODE_UPDATE, {
      roomId,
      content: newVal,
      language: newLang,
    });
  }, [roomId]);

  const updateContent = useCallback((newVal: string, skipHistory = false) => {
    if (!skipHistory && contentRef.current !== newVal) {
      undoStack.current.push(contentRef.current);
      redoStack.current = [];
    }
    setContent(newVal);
    contentRef.current = newVal;
    triggerChange(newVal, language);
  }, [language, triggerChange]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(contentRef.current);
    setContent(prev);
    contentRef.current = prev;
    triggerChange(prev, language);
  }, [language, triggerChange]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(contentRef.current);
    setContent(next);
    contentRef.current = next;
    triggerChange(next, language);
  }, [language, triggerChange]);

  // Tab key indent & Undo/Redo keyboard shortcuts helper
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newContent = content.slice(0, start) + '  ' + content.slice(end);
      
      updateContent(newContent);

      // Reset cursor pos after render
      requestAnimationFrame(() => {
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2;
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateContent(val);

    // Mark as typing so incoming socket updates don't overwrite user cursor
    isTypingRef.current = true;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLanguage(val);
    triggerChange(content, val);
  };

  const handleLoadTemplate = () => {
    const template = BOILERPLATES[language];
    if (!template) return;
    if (content.trim() !== '') {
      if (!window.confirm('Load template? This will replace your current code.')) {
        return;
      }
    }
    updateContent(template);
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
      const workerCode = `
        const logs = [];
        console.log = (...args) => {
          logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
        };
        
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

  const lines = content.split('\n');

  return (
    <div className={styles.container}>
      {/* ── Header Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
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

          <button className={styles.copyBtn} onClick={handleLoadTemplate} title="Load Starter Template">
            <FileCode size={14} />
            Template
          </button>

          <div style={{ height: 18, width: 1, backgroundColor: '#30363d', margin: '0 var(--space-1)' }} />

          <button 
            className={styles.copyBtn} 
            onClick={handleUndo} 
            disabled={undoStack.current.length === 0} 
            title="Undo (Ctrl+Z)"
            style={{ opacity: undoStack.current.length === 0 ? 0.4 : 1 }}
          >
            <Undo size={14} />
          </button>

          <button 
            className={styles.copyBtn} 
            onClick={handleRedo} 
            disabled={redoStack.current.length === 0} 
            title="Redo (Ctrl+Shift+Z)"
            style={{ opacity: redoStack.current.length === 0 ? 0.4 : 1 }}
          >
            <Redo size={14} />
          </button>
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
