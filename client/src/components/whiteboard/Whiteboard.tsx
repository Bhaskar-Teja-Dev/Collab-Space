import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SOCKET_EVENTS } from '@collab-space/shared';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/auth';
import { useToast } from '../ui';
import { Square, Circle, Edit2, Type, Download, Trash2, ArrowUpRight, Undo2, Redo2 } from 'lucide-react';
import styles from './Whiteboard.module.css';

interface Shape {
  id: string;
  type: 'pen' | 'rect' | 'circle' | 'arrow' | 'text';
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  authorId: string;
}

interface Props {
  roomId: string | null;
}

const COLORS = [
  '#ffffff', // White
  '#f87171', // Red
  '#fb923c', // Orange
  '#facc15', // Yellow
  '#4ade80', // Green
  '#60a5fa', // Blue
  '#c084fc', // Purple
  '#a1a1aa', // Grey
];

const STROKE_WIDTHS = [
  { value: 2, label: 'Thin' },
  { value: 5, label: 'Medium' },
  { value: 10, label: 'Thick' },
];

export default function Whiteboard({ roomId }: Props) {
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();
  
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<'pen' | 'rect' | 'circle' | 'arrow' | 'text'>('pen');
  const [color, setColor] = useState(COLORS[5]); // Blue default
  const [strokeWidth, setStrokeWidth] = useState(5);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState<{ x: number; y: number; val: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const undoStack = useRef<Shape[][]>([]);
  const redoStack = useRef<Shape[][]>([]);

  // Sync shapes from socket
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const handleWbState = (data: { shapes: Shape[] }) => {
      setShapes(data.shapes);
    };

    const handleShapeAdd = (data: { shape: Shape }) => {
      setShapes((prev) => [...prev, data.shape]);
    };

    const handleShapeUpdate = (data: { shape: Shape }) => {
      setShapes((prev) => prev.map((s) => (s.id === data.shape.id ? data.shape : s)));
    };

    const handleShapeDelete = (data: { shapeId: string }) => {
      setShapes((prev) => prev.filter((s) => s.id !== data.shapeId));
    };

    socket.on(SOCKET_EVENTS.WB_STATE, handleWbState);
    socket.on(SOCKET_EVENTS.SHAPE_ADD, handleShapeAdd);
    socket.on(SOCKET_EVENTS.SHAPE_UPDATE, handleShapeUpdate);
    socket.on(SOCKET_EVENTS.SHAPE_DELETE, handleShapeDelete);

    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId });

    return () => {
      socket.off(SOCKET_EVENTS.WB_STATE, handleWbState);
      socket.off(SOCKET_EVENTS.SHAPE_ADD, handleShapeAdd);
      socket.off(SOCKET_EVENTS.SHAPE_UPDATE, handleShapeUpdate);
      socket.off(SOCKET_EVENTS.SHAPE_DELETE, handleShapeDelete);
    };
  }, [roomId]);

  // Main drawing engine
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    const gridSpacing = 30;
    for (let x = 0; x < canvas.width; x += gridSpacing) {
      for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawShape = (s: Shape) => {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.strokeWidth;

      if (s.type === 'pen' && s.points && s.points.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(s.points[0], s.points[1]);
        for (let i = 2; i < s.points.length; i += 2) {
          ctx.lineTo(s.points[i], s.points[i + 1]);
        }
        ctx.stroke();
      } else if (s.type === 'rect' && s.x !== undefined && s.y !== undefined && s.width !== undefined && s.height !== undefined) {
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.width, s.height);
        ctx.stroke();
      } else if (s.type === 'circle' && s.x !== undefined && s.y !== undefined && s.width !== undefined && s.height !== undefined) {
        ctx.beginPath();
        const rx = s.width / 2;
        const ry = s.height / 2;
        const cx = s.x + rx;
        const cy = s.y + ry;
        ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (s.type === 'arrow' && s.x !== undefined && s.y !== undefined && s.width !== undefined && s.height !== undefined) {
        const x2 = s.x + s.width;
        const y2 = s.y + s.height;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const angle = Math.atan2(y2 - s.y, x2 - s.x);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 15 * Math.cos(angle - Math.PI / 6), y2 - 15 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - 15 * Math.cos(angle + Math.PI / 6), y2 - 15 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (s.type === 'text' && s.x !== undefined && s.y !== undefined && s.text) {
        ctx.font = `${s.strokeWidth * 3 + 12}px var(--font-sans)`;
        ctx.fillText(s.text, s.x, s.y);
      }
    };

    shapes.forEach(drawShape);

    if (isDrawing) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = strokeWidth;

      if (tool === 'pen' && currentPoints.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0], currentPoints[1]);
        for (let i = 2; i < currentPoints.length; i += 2) {
          ctx.lineTo(currentPoints[i], currentPoints[i + 1]);
        }
        ctx.stroke();
      } else if (tool === 'rect') {
        ctx.beginPath();
        ctx.rect(startPos.x, startPos.y, currentPos.x - startPos.x, currentPos.y - startPos.y);
        ctx.stroke();
      } else if (tool === 'circle') {
        ctx.beginPath();
        const rx = (currentPos.x - startPos.x) / 2;
        const ry = (currentPos.y - startPos.y) / 2;
        ctx.ellipse(startPos.x + rx, startPos.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();

        const angle = Math.atan2(currentPos.y - startPos.y, currentPos.x - startPos.x);
        ctx.beginPath();
        ctx.moveTo(currentPos.x, currentPos.y);
        ctx.lineTo(currentPos.x - 15 * Math.cos(angle - Math.PI / 6), currentPos.y - 15 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(currentPos.x - 15 * Math.cos(angle + Math.PI / 6), currentPos.y - 15 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }
  }, [shapes, isDrawing, currentPoints, currentPos, startPos, tool, color, strokeWidth]);

  // Make canvas responsive
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      drawCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [shapes, isDrawing, currentPoints, currentPos, startPos, tool, color, strokeWidth, drawCanvas]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(shapes);
    
    const socket = getSocket();
    if (roomId && socket) {
      const currentIds = new Set(shapes.map(s => s.id));
      const prevIds = new Set(prev.map(s => s.id));
      
      shapes.forEach(s => {
        if (!prevIds.has(s.id)) {
          socket.emit(SOCKET_EVENTS.SHAPE_DELETE, { roomId, shapeId: s.id });
        }
      });
      prev.forEach(s => {
        if (!currentIds.has(s.id)) {
          socket.emit(SOCKET_EVENTS.SHAPE_ADD, { roomId, shape: s });
        }
      });
    }
    setShapes(prev);
  }, [shapes, roomId]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(shapes);

    const socket = getSocket();
    if (roomId && socket) {
      const currentIds = new Set(shapes.map(s => s.id));
      const nextIds = new Set(next.map(s => s.id));
      
      next.forEach(s => {
        if (!currentIds.has(s.id)) {
          socket.emit(SOCKET_EVENTS.SHAPE_ADD, { roomId, shape: s });
        }
      });
      shapes.forEach(s => {
        if (!nextIds.has(s.id)) {
          socket.emit(SOCKET_EVENTS.SHAPE_DELETE, { roomId, shapeId: s.id });
        }
      });
    }
    setShapes(next);
  }, [shapes, roomId]);

  // Bind keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement?.tagName;
      if (active === 'INPUT' || active === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textInput) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentPos({ x, y });

    if (tool === 'pen') {
      setCurrentPoints([x, y]);
    } else if (tool === 'text') {
      setTextInput({ x, y, val: '' });
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentPos({ x, y });

    if (tool === 'pen') {
      setCurrentPoints((prev) => [...prev, x, y]);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (!roomId) return;
    const socket = getSocket();

    const shapeId = crypto.randomUUID();
    let newShape: Shape | null = null;

    if (tool === 'pen' && currentPoints.length >= 4) {
      newShape = {
        id: shapeId,
        type: 'pen',
        points: currentPoints,
        color,
        strokeWidth,
        authorId: user?.id ?? '',
      };
    } else if (tool === 'rect') {
      newShape = {
        id: shapeId,
        type: 'rect',
        x: startPos.x,
        y: startPos.y,
        width: currentPos.x - startPos.x,
        height: currentPos.y - startPos.y,
        color,
        strokeWidth,
        authorId: user?.id ?? '',
      };
    } else if (tool === 'circle') {
      newShape = {
        id: shapeId,
        type: 'circle',
        x: startPos.x,
        y: startPos.y,
        width: currentPos.x - startPos.x,
        height: currentPos.y - startPos.y,
        color,
        strokeWidth,
        authorId: user?.id ?? '',
      };
    } else if (tool === 'arrow') {
      newShape = {
        id: shapeId,
        type: 'arrow',
        x: startPos.x,
        y: startPos.y,
        width: currentPos.x - startPos.x,
        height: currentPos.y - startPos.y,
        color,
        strokeWidth,
        authorId: user?.id ?? '',
      };
    }

    if (newShape) {
      undoStack.current.push(shapes);
      redoStack.current = [];
      setShapes((prev) => [...prev, newShape!]);
      socket.emit(SOCKET_EVENTS.SHAPE_ADD, { roomId, shape: newShape });
    }

    setCurrentPoints([]);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput || !textInput.val.trim() || !roomId) {
      setTextInput(null);
      return;
    }

    const socket = getSocket();
    const newShape: Shape = {
      id: crypto.randomUUID(),
      type: 'text',
      x: textInput.x,
      y: textInput.y,
      text: textInput.val.trim(),
      color,
      strokeWidth,
      authorId: user?.id ?? '',
    };

    undoStack.current.push(shapes);
    redoStack.current = [];
    setShapes((prev) => [...prev, newShape]);
    socket.emit(SOCKET_EVENTS.SHAPE_ADD, { roomId, shape: newShape });
    setTextInput(null);
  };

  const clearCanvas = (e: React.MouseEvent) => {
    if (!roomId) return;
    const socket = getSocket();

    undoStack.current.push(shapes);
    redoStack.current = [];

    if (e.shiftKey) {
      if (confirm('Clear whiteboard for all users in this room?')) {
        shapes.forEach((s) => {
          socket.emit(SOCKET_EVENTS.SHAPE_DELETE, { roomId, shapeId: s.id });
        });
        setShapes([]);
        showToast('Whiteboard cleared for everyone', 'success');
      }
    } else {
      setShapes([]);
      showToast('Cleared your whiteboard screen locally. Shift+Click to clear for all.', 'info');
    }
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = url;
    link.click();
    showToast('Snapshot downloaded', 'success');
  };

  return (
    <div className={styles.container}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolGroup}>
          <button
            className={`${styles.toolBtn} ${tool === 'pen' ? styles.active : ''}`}
            onClick={() => { setTool('pen'); setTextInput(null); }}
            title="Pen / Marker"
          >
            <Edit2 size={16} />
          </button>
          <button
            className={`${styles.toolBtn} ${tool === 'rect' ? styles.active : ''}`}
            onClick={() => { setTool('rect'); setTextInput(null); }}
            title="Rectangle"
          >
            <Square size={16} />
          </button>
          <button
            className={`${styles.toolBtn} ${tool === 'circle' ? styles.active : ''}`}
            onClick={() => { setTool('circle'); setTextInput(null); }}
            title="Circle"
          >
            <Circle size={16} />
          </button>
          <button
            className={`${styles.toolBtn} ${tool === 'arrow' ? styles.active : ''}`}
            onClick={() => { setTool('arrow'); setTextInput(null); }}
            title="Arrow"
          >
            <ArrowUpRight size={16} />
          </button>
          <button
            className={`${styles.toolBtn} ${tool === 'text' ? styles.active : ''}`}
            onClick={() => setTool('text')}
            title="Text Tool"
          >
            <Type size={16} />
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.toolGroup}>
          <button 
            className={styles.toolBtn} 
            onClick={handleUndo} 
            disabled={undoStack.current.length === 0}
            title="Undo (Ctrl+Z)"
            style={{ opacity: undoStack.current.length === 0 ? 0.4 : 1 }}
          >
            <Undo2 size={16} />
          </button>
          <button 
            className={styles.toolBtn} 
            onClick={handleRedo} 
            disabled={redoStack.current.length === 0}
            title="Redo (Ctrl+Shift+Z)"
            style={{ opacity: redoStack.current.length === 0 ? 0.4 : 1 }}
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className={styles.divider} />

        {/* Colors */}
        <div className={styles.colorPalette}>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.colorBtn} ${color === c ? styles.colorActive : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className={styles.divider} />

        {/* Thickness */}
        <div className={styles.thicknessGroup}>
          {STROKE_WIDTHS.map((sw) => (
            <button
              key={sw.value}
              className={`${styles.thickBtn} ${strokeWidth === sw.value ? styles.thickActive : ''}`}
              onClick={() => setStrokeWidth(sw.value)}
            >
              {sw.label}
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        {/* Utility buttons */}
        <div className={styles.toolGroup}>
          <button className={styles.actionBtn} onClick={downloadCanvas} title="Export image">
            <Download size={16} />
          </button>
          <button className={`${styles.actionBtn} ${styles.danger}`} onClick={clearCanvas} title="Clear board (Shift+Click to clear for all)">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* ── Canvas Area ── */}
      <div ref={containerRef} className={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={styles.canvas}
        />

        {/* Text Tool Floating Input */}
        {textInput && (
          <form
            onSubmit={handleTextSubmit}
            className={styles.floatingTextForm}
            style={{ left: textInput.x, top: textInput.y }}
          >
            <input
              type="text"
              autoFocus
              className={styles.floatingTextInput}
              value={textInput.val}
              onChange={(e) => setTextInput((prev) => prev && { ...prev, val: e.target.value })}
              onBlur={handleTextSubmit}
              placeholder="Type here, press Enter..."
              style={{ color }}
            />
          </form>
        )}
      </div>
    </div>
  );
}
