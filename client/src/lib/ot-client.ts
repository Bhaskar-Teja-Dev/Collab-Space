/**
 * OT Client — browser-side operational transformation helper.
 *
 * Responsibilities:
 *  1. Convert raw textarea diffs to Insert/Delete operations (diffToOp)
 *  2. Track client state: version, pending op, client ID
 *  3. Submit ops to the server
 *  4. Handle ACK — advance version, clear pending
 *  5. Handle remote broadcast — transform incoming op against pending,
 *     return the op that should be applied to local text
 */

import { SOCKET_EVENTS, type Operation, type InsertOp, type DeleteOp } from '@collab-space/shared';
import { transformOp } from '@collab-space/shared';
import type { Socket } from 'socket.io-client';
import type { OperationAck, VersionedOperation } from '@collab-space/shared';

// --- diffToOp ----------------------------------------------------------------

/**
 * Derive a single Insert or Delete operation from the diff between two strings.
 *
 * Algorithm:
 *  1. Scan from the start to find the first character that differs.
 *  2. Scan from the end to find the last character that differs (in both strings).
 *  3. Extract the changed region from each string.
 *  4. If the new string has more chars in that region  => InsertOp
 *     If the new string has fewer chars in that region => DeleteOp
 *
 * Returns null when the strings are identical.
 */
export function diffToOp(oldText: string, newText: string): Operation | null {
  if (oldText === newText) return null;

  // 1. Find first differing index
  let start = 0;
  while (
    start < oldText.length &&
    start < newText.length &&
    oldText[start] === newText[start]
  ) {
    start++;
  }

  // 2. Find last differing index (from end)
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  // 3. Extract changed slices
  const oldSlice = oldText.slice(start, oldEnd);
  const newSlice = newText.slice(start, newEnd);

  // 4. Determine op type
  if (newSlice.length > 0 && oldSlice.length === 0) {
    const op: InsertOp = { type: 'insert', position: start, chars: newSlice };
    return op;
  }

  if (oldSlice.length > 0 && newSlice.length === 0) {
    const op: DeleteOp = { type: 'delete', position: start, count: oldSlice.length };
    return op;
  }

  // Replacement: emit delete first; next diff will produce the insert
  if (oldSlice.length > 0) {
    const op: DeleteOp = { type: 'delete', position: start, count: oldSlice.length };
    return op;
  }

  const op: InsertOp = { type: 'insert', position: start, chars: newSlice };
  return op;
}

// --- OTClient ----------------------------------------------------------------

export class OTClient {
  /** The version we have confirmed from the server (last acked). */
  version: number = 0;

  /** Op submitted to server but not yet acknowledged. */
  pendingOp: Operation | null = null;

  /** Stable identifier for this browser tab. */
  readonly clientId: string;

  constructor() {
    this.clientId = crypto.randomUUID();
  }

  /**
   * Submit an operation to the server.
   * Stores it as pending so we can transform incoming remote ops against it.
   */
  submit(
    op: Operation,
    roomId: string,
    documentId: string,
    socket: Socket
  ): void {
    this.pendingOp = op;

    const versioned: VersionedOperation = {
      clientId: this.clientId,
      roomId,
      documentId,
      baseVersion: this.version,
      operation: op,
    };

    socket.emit(SOCKET_EVENTS.OP_SUBMIT, versioned);
  }

  /**
   * Called when the server ACKs our submitted op.
   * Advance the version counter, clear the pending op.
   */
  handleAck(ack: OperationAck): void {
    this.version = ack.newVersion;
    this.pendingOp = null;
  }

  /**
   * Called when a remote op broadcast arrives.
   *
   * If we have a pending op (submitted but not yet acked), we must transform
   * the incoming op against our pending op before applying it to local text.
   * This preserves the user's in-flight edit.
   *
   * Returns the (possibly transformed) op that should be applied to local state.
   */
  handleBroadcast(incomingOp: Operation): Operation {
    if (!this.pendingOp) {
      return incomingOp;
    }

    // Transform incoming op so it can be applied after our pending local op.
    return transformOp(incomingOp, this.pendingOp);
  }
}
