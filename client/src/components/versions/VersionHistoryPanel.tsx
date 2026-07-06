import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../ui';
import { X, Save, RefreshCw, Sparkles, Copy, Calendar, User } from 'lucide-react';
import styles from './VersionHistoryPanel.module.css';

interface VersionCreator {
  displayName: string;
  avatarColor: string;
}

interface RoomVersion {
  id: string;
  name: string;
  createdAt: string;
  createdBy: VersionCreator;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  docContent: string;
  whiteboard: unknown[];
  notes: unknown[];
  codeContent: string;
  codeLang: string;
  onRevertSuccess: (data: {
    docContent: string;
    whiteboard: string;
    notes: string;
    codeContent: string;
    codeLang: string;
  }) => void;
}

export default function VersionHistoryPanel({
  isOpen,
  onClose,
  roomId,
  docContent,
  whiteboard,
  notes,
  codeContent,
  codeLang,
  onRevertSuccess,
}: Props) {
  const { showToast } = useToast();

  const [versions, setVersions] = useState<RoomVersion[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Selection states for AI summarization
  const [selectedV1, setSelectedV1] = useState<string | null>(null);
  const [selectedV2, setSelectedV2] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const fetchVersions = async () => {
    if (!roomId) return;
    setIsLoading(true);
    try {
      const data = await api.rooms.listVersions(roomId);
      setVersions(data.versions);
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch version history', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
      setSelectedV1(null);
      setSelectedV2(null);
      setSummary(null);
    }
  }, [isOpen, roomId]);

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = snapshotName.trim() || 'Manual snapshot';

    setIsSaving(true);
    try {
      await api.rooms.saveVersion(roomId, {
        name,
        docContent,
        whiteboard: JSON.stringify(whiteboard),
        notes: JSON.stringify(notes),
        codeContent,
        codeLang,
      });
      showToast('Snapshot saved successfully', 'success');
      setSnapshotName('');
      fetchVersions();
    } catch (err) {
      console.error(err);
      showToast('Failed to save snapshot', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = async (versionId: string) => {
    if (!window.confirm('Revert all editor modules to this version? Current unsaved work will be lost.')) return;

    try {
      const res = await api.rooms.revertVersion(roomId, versionId);
      showToast('Reverted successfully!', 'success');
      onRevertSuccess(res.version);
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Only room owner can revert versions', 'danger');
    }
  };

  const handleCardClick = (versionId: string) => {
    if (selectedV1 === versionId) {
      setSelectedV1(null);
      setSelectedV2(null);
    } else if (selectedV2 === versionId) {
      setSelectedV2(null);
    } else if (!selectedV1) {
      setSelectedV1(versionId);
    } else if (!selectedV2) {
      setSelectedV2(versionId);
    } else {
      setSelectedV1(versionId);
      setSelectedV2(null);
    }
  };

  const handleSummarize = async () => {
    if (!selectedV1 || !selectedV2) return;
    setIsSummarizing(true);
    setSummary(null);

    const idx1 = versions.findIndex(v => v.id === selectedV1);
    const idx2 = versions.findIndex(v => v.id === selectedV2);
    const olderId = idx1 > idx2 ? selectedV1 : selectedV2;
    const newerId = idx1 > idx2 ? selectedV2 : selectedV1;

    try {
      const res = await api.rooms.summarizeVersions(roomId, olderId, newerId);
      setSummary(res.summary);
    } catch (err) {
      console.error(err);
      showToast('AI Summarization failed. Verify GEMINI_API_KEY is configured.', 'danger');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = () => {
    if (summary) {
      navigator.clipboard.writeText(summary);
      showToast('Summary copied to clipboard', 'success');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>Version History</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSaveSnapshot} className={styles.snapshotForm}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              placeholder="Name this version..."
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              className={styles.input}
              maxLength={60}
            />
            <button type="submit" disabled={isSaving} className={styles.saveBtn}>
              {isSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
              Save Snapshot
            </button>
          </div>
        </form>

        <div className={styles.explainer}>
          <Sparkles size={12} className={styles.sparkleIcon} />
          <span>Select <strong>two versions</strong> below to generate an AI difference summary.</span>
        </div>

        {(selectedV1 || selectedV2) && (
          <div className={styles.summarizeBar}>
            <button
              onClick={handleSummarize}
              disabled={!selectedV1 || !selectedV2 || isSummarizing}
              className={styles.summarizeBtn}
            >
              {isSummarizing ? (
                <>
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Summarize Selected
                </>
              )}
            </button>
            <button
              onClick={() => {
                setSelectedV1(null);
                setSelectedV2(null);
                setSummary(null);
              }}
              className={styles.clearSelectBtn}
            >
              Clear selection
            </button>
          </div>
        )}

        <div className={styles.versionsList}>
          {isLoading && (
            <div className={styles.loadingState}>
              <span className="spinner" />
              <p>Fetching version history...</p>
            </div>
          )}

          {!isLoading && versions.length === 0 && (
            <div className={styles.emptyState}>
              <p>No snapshots saved for this room yet.</p>
            </div>
          )}

          {!isLoading &&
            versions.map((v) => {
              const isSelected = selectedV1 === v.id || selectedV2 === v.id;
              const formattedDate = new Date(v.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={v.id}
                  onClick={() => handleCardClick(v.id)}
                  className={`${styles.card} ${isSelected ? styles.selectedCard : ''}`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.cardName}>{v.name}</span>
                    <span className={styles.cardTime}>
                      <Calendar size={10} style={{ marginRight: 3 }} />
                      {formattedDate}
                    </span>
                  </div>

                  <div className={styles.cardMeta}>
                    <div className={styles.creator}>
                      <span
                        className={styles.avatarColorDot}
                        style={{ backgroundColor: v.createdBy.avatarColor }}
                      />
                      <User size={10} style={{ marginRight: 3 }} />
                      <span>{v.createdBy.displayName}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevert(v.id);
                      }}
                      className={styles.revertBtn}
                    >
                      <RefreshCw size={11} />
                      Revert
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {summary && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>AI Session Summary</h3>
              <button className={styles.closeBtn} onClick={() => setSummary(null)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <pre className={styles.summaryText}>{summary}</pre>
            </div>
            <div className={styles.modalFooter}>
              <button onClick={handleCopySummary} className={styles.copyBtn}>
                <Copy size={14} />
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
