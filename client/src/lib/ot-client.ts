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

  /** Op currently in flight (submitted to server but not yet acknowledged). */
  pendingOp: Operation | null = null;

  /** Queue of all operations generated locally but not yet acknowledged. */
  queue: Operation[] = [];

  /** Stable identifier for this browser tab. */
  readonly clientId: string;

  constructor() {
    this.clientId = crypto.randomUUID();
  }

  /**
   * Submit an operation to the server.
   * Pushes the operation to the local queue and fires it if no other op is in flight.
   */
  submit(
    op: Operation,
    roomId: string,
    documentId: string,
    socket: Socket
  ): void {
    this.queue.push(op);

    if (!this.pendingOp) {
      this.sendNext(roomId, documentId, socket);
    }
  }

  /**
   * Send the next operation in the queue to the server.
   */
  private sendNext(roomId: string, documentId: string, socket: Socket): void {
    if (this.queue.length === 0) return;

    const op = this.queue[0];
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
   * Called when the server ACKs our in-flight op.
   * Advance the version counter, remove the op from queue, and send the next one.
   */
  handleAck(ack: OperationAck, roomId: string, documentId: string, socket: Socket): void {
    this.version = ack.newVersion;
    this.queue.shift(); // Remove the acknowledged operation
    this.pendingOp = null;

    // Process the next operation in the queue
    this.sendNext(roomId, documentId, socket);
  }

  /**
   * Called when a remote op broadcast arrives.
   *
   * We transform the incoming remote op against all local operations currently
   * buffered in our queue (both the in-flight op and any queued ones).
   *
   * Returns the transformed op that should be applied to local text.
   */
  handleBroadcast(incomingOp: Operation): Operation {
    let current = incomingOp;
    for (const localOp of this.queue) {
      current = transformOp(current, localOp);
    }
    return current;
  }
}
