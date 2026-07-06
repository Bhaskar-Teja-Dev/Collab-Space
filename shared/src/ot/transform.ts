/**
 * OT Transform Function — the algorithmic heart of CollabSpace.
 *
 * Given two operations op1 and op2 that were both based on the same document
 * version, transform(op1, op2) returns op1' such that:
 *
 *   apply(apply(doc, op2), op1') === apply(apply(doc, op1), op2')
 *
 * This is the "convergence" property of OT — no matter what order ops arrive,
 * every client ends up with the same document.
 *
 * SERVER USE:
 *   The server is authoritative. When it receives an op based on version V,
 *   it transforms the op against every op already applied since version V
 *   (the "history"), then applies the result.
 *
 * CLIENT USE:
 *   When a client receives a remote op, it transforms that op against any
 *   pending local ops (ops that the client has sent but not yet been ACK'd).
 *   This preserves the client's local edits.
 *
 * ─── Reading List ────────────────────────────────────────────────────────────
 * Before implementing this fully, read:
 *   1. https://operational-transformation.github.io/  (visual explainer)
 *   2. https://github.com/ottypes/text               (reference implementation)
 *   3. Joseph Gentle's blog post on ShareDB
 *
 * The cases below are the complete truth table for insert vs. insert,
 * insert vs. delete, and delete vs. delete.
 */

import type { Operation, InsertOp, DeleteOp } from '../types';

// ─── Apply ────────────────────────────────────────────────────────────────────

/**
 * Apply an operation to a document string, returning the new string.
 */
export function applyOp(doc: string, op: Operation): string {
  if (op.type === 'retain') return doc; // no-op for v1

  if (op.type === 'insert') {
    const before = doc.slice(0, op.position);
    const after = doc.slice(op.position);
    return before + op.chars + after;
  }

  if (op.type === 'delete') {
    const before = doc.slice(0, op.position);
    const after = doc.slice(op.position + op.count);
    return before + after;
  }

  return doc;
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * transform(op1, op2) → op1'
 *
 * op1 and op2 were both based on the same document version.
 * Returns a new op1 that can be applied AFTER op2.
 *
 * Think of it as: "given that op2 has already happened, how do I adjust op1
 * so it still does what the user intended?"
 */
export function transformOp(op1: Operation, op2: Operation): Operation {
  // Retain ops don't mutate document — no transformation needed
  if (op1.type === 'retain' || op2.type === 'retain') return op1;

  // ── insert vs insert ──────────────────────────────────────────────────────
  if (op1.type === 'insert' && op2.type === 'insert') {
    return transformInsertInsert(op1, op2);
  }

  // ── insert vs delete ──────────────────────────────────────────────────────
  if (op1.type === 'insert' && op2.type === 'delete') {
    return transformInsertDelete(op1, op2);
  }

  // ── delete vs insert ──────────────────────────────────────────────────────
  if (op1.type === 'delete' && op2.type === 'insert') {
    return transformDeleteInsert(op1, op2);
  }

  // ── delete vs delete ──────────────────────────────────────────────────────
  if (op1.type === 'delete' && op2.type === 'delete') {
    return transformDeleteDelete(op1, op2);
  }

  return op1; // fallback (should never reach here with typed ops)
}

// ─── Case: Insert vs Insert ───────────────────────────────────────────────────
//
// Two users insert at different or same positions.
//
// Example:
//   doc = "AC"
//   op1 = insert(1, "B")   → "ABC"
//   op2 = insert(1, "X")   → "AXC"
//
//   op2 inserted at pos=1, shifting everything at pos≥1 right by 1.
//   If op1.position > op2.position: adjust op1.position += op2.chars.length
//   If op1.position === op2.position: tie-break by clientId (lexicographic)
//   If op1.position < op2.position: op1 is unaffected

function transformInsertInsert(op1: InsertOp, op2: InsertOp): InsertOp {
  if (op1.position > op2.position) {
    // op2 inserted before op1 — shift op1 right
    return { ...op1, position: op1.position + op2.chars.length };
  }

  if (op1.position === op2.position) {
    // Tie-break: the op with the "later" clientId yields
    // (both clients must use the same tie-breaking rule)
    // TODO: pass clientIds in and use lexicographic comparison
    // For now, op1 wins ties (op1 goes first, so op2 shifts)
    return op1;
  }

  // op1.position < op2.position — op2 is to the right, no adjustment needed
  return op1;
}

// ─── Case: Insert vs Delete ───────────────────────────────────────────────────
//
// op1 inserts, op2 deleted some characters.
//
// If the deletion happened before op1's position: shift op1 left
// If the deletion happened at/after op1's position: op1 unaffected

function transformInsertDelete(op1: InsertOp, op2: DeleteOp): InsertOp {
  if (op2.position + op2.count <= op1.position) {
    // Deletion is entirely before op1 — shift op1 left by deleted count
    return { ...op1, position: op1.position - op2.count };
  }

  if (op2.position >= op1.position) {
    // Deletion is at or after op1 — op1 unaffected
    return op1;
  }

  // Deletion overlaps op1's position — op1 shifts to where the deletion started
  return { ...op1, position: op2.position };
}

// ─── Case: Delete vs Insert ───────────────────────────────────────────────────
//
// op1 deletes, op2 inserted some characters.
//
// If the insertion is before op1: shift op1's position right
// If the insertion is inside op1's deletion range: grow the deletion count
// If the insertion is after op1's range: no adjustment

function transformDeleteInsert(op1: DeleteOp, op2: InsertOp): DeleteOp {
  if (op2.position <= op1.position) {
    // Insert is at or before delete start — shift delete right
    return { ...op1, position: op1.position + op2.chars.length };
  }

  if (op2.position < op1.position + op1.count) {
    // Insert is inside the deletion range — grow count to include the new chars
    return { ...op1, count: op1.count + op2.chars.length };
  }

  // Insert is after the deletion range — unaffected
  return op1;
}

// ─── Case: Delete vs Delete ───────────────────────────────────────────────────
//
// Both users deleted. This is the trickiest case.
//
// Subcases:
//   1. op2 is entirely before op1 → shift op1 left
//   2. op1 is entirely before op2 → op1 unaffected
//   3. Overlapping or nested deletions → shrink op1 by the overlap

function transformDeleteDelete(op1: DeleteOp, op2: DeleteOp): DeleteOp {
  const op1End = op1.position + op1.count;
  const op2End = op2.position + op2.count;

  if (op2End <= op1.position) {
    // op2 is entirely before op1 — shift op1 left
    return { ...op1, position: op1.position - op2.count };
  }

  if (op2.position >= op1End) {
    // op2 is entirely after op1 — no adjustment
    return op1;
  }

  // Overlapping deletions — both tried to delete some of the same chars.
  // op1 should only delete chars that op2 didn't already delete.

  const overlapStart = Math.max(op1.position, op2.position);
  const overlapEnd = Math.min(op1End, op2End);
  const overlap = overlapEnd - overlapStart;

  const newPosition = op1.position <= op2.position
    ? op1.position               // op1 starts before op2
    : Math.max(0, op1.position - (op2.position + overlap - op1.position)); // TODO: verify edge

  const newCount = Math.max(0, op1.count - overlap);

  if (newCount === 0) {
    // The entire deletion was already handled by op2 — make it a no-op retain
    return { type: 'retain', count: 0 } as unknown as DeleteOp;
  }

  return { ...op1, position: newPosition, count: newCount };
}

// ─── Transform Sequence ───────────────────────────────────────────────────────

/**
 * Transform op1 against an entire history of ops.
 * Used server-side to catch up an op from an older version.
 *
 * @param op       - The incoming operation (based on version = historyStart)
 * @param history  - All ops applied since historyStart, in order
 * @returns        - The transformed op, ready to apply at the current version
 */
export function transformAgainstHistory(
  op: Operation,
  history: Operation[]
): Operation {
  let current = op;
  for (const historyOp of history) {
    current = transformOp(current, historyOp);
  }
  return current;
}
