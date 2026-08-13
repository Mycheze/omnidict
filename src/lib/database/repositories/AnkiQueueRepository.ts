import { DatabaseCore } from "../core";
import { PendingAnkiCardRow, PendingCardStatus } from "@/lib/types";

/** Prepared-statement handle shape from DatabaseCore's unified interface */
type Statement = ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;

/** How long a 'flushing' claim is honored before it can be stolen */
const STALE_CLAIM_MODIFIER = "-10 minutes";

/**
 * Repository for the server-side pending Anki card queue. Cards are enqueued
 * with a per-user dedup key, claimed by a flush session, and marked
 * done/error; stale claims (crashed flushers) become reclaimable after a
 * timeout.
 */
export class AnkiQueueRepository {
  private core: DatabaseCore;
  private statements: {
    enqueue: Statement;
    claim: Statement;
    saveMediaValues: Statement;
    markDone: Statement;
    markError: Statement;
    release: Statement;
    deletePending: Statement;
  } | null = null;

  constructor(core: DatabaseCore) {
    this.core = core;
  }

  /**
   * Get prepared statements, initializing them if needed
   */
  private getStatements() {
    if (!this.statements) {
      const db = this.core.getDatabase();

      this.statements = {
        enqueue: db.prepare(`
          INSERT OR IGNORE INTO pending_anki_cards (refold_user_id, dedup_key, context_json)
          VALUES (?, ?, ?)
        `),

        claim: db.prepare(`
          UPDATE pending_anki_cards
          SET status = 'flushing',
              claimed_by = ?,
              claimed_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
            AND (
              status = 'queued'
              OR (status = 'flushing' AND claimed_at < datetime('now', '${STALE_CLAIM_MODIFIER}'))
            )
        `),

        saveMediaValues: db.prepare(`
          UPDATE pending_anki_cards
          SET media_values_json = ?, updated_at = datetime('now')
          WHERE id = ?
        `),

        markDone: db.prepare(`
          UPDATE pending_anki_cards
          SET status = 'done',
              anki_note_id = ?,
              error = NULL,
              claimed_by = NULL,
              claimed_at = NULL,
              flushed_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `),

        markError: db.prepare(`
          UPDATE pending_anki_cards
          SET status = 'error',
              error = ?,
              attempts = attempts + 1,
              claimed_by = NULL,
              claimed_at = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `),

        release: db.prepare(`
          UPDATE pending_anki_cards
          SET status = 'queued',
              claimed_by = NULL,
              claimed_at = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `),

        deletePending: db.prepare(`
          DELETE FROM pending_anki_cards
          WHERE id = ? AND refold_user_id = ? AND status != 'flushing'
        `),
      };
    }
    return this.statements;
  }

  /**
   * Enqueue a card. Returns true when a new row was inserted, false when a
   * card with the same (user, dedup key) already exists.
   */
  public async enqueue(
    refoldUserId: number,
    dedupKey: string,
    contextJson: string,
  ): Promise<boolean> {
    const statements = this.getStatements();
    const result = await statements.enqueue.run(
      refoldUserId,
      dedupKey,
      contextJson,
    );
    return result.changes > 0;
  }

  /**
   * Enqueue many cards atomically (e.g. import). Duplicates are ignored.
   * Returns the number of rows actually inserted.
   */
  public async enqueueMany(
    refoldUserId: number,
    cards: Array<{ dedupKey: string; contextJson: string }>,
  ): Promise<number> {
    if (cards.length === 0) return 0;

    const db = this.core.getDatabase();
    const statements = this.getStatements();

    return db.transaction(async () => {
      let inserted = 0;
      for (const card of cards) {
        const result = await statements.enqueue.run(
          refoldUserId,
          card.dedupKey,
          card.contextJson,
        );
        inserted += result.changes;
      }
      return inserted;
    });
  }

  /**
   * List a user's cards in the given statuses, oldest first
   */
  public async listByUser(
    refoldUserId: number,
    statuses: PendingCardStatus[],
  ): Promise<PendingAnkiCardRow[]> {
    if (statuses.length === 0) return [];

    // IN-clause length varies, so this statement is prepared per call
    const db = this.core.getDatabase();
    const placeholders = statuses.map(() => "?").join(", ");
    const stmt = db.prepare(`
      SELECT id, refold_user_id, dedup_key, schema_version, context_json,
             status, media_values_json, anki_note_id, error, attempts,
             claimed_by, claimed_at, created_at, updated_at, flushed_at
      FROM pending_anki_cards
      WHERE refold_user_id = ? AND status IN (${placeholders})
      ORDER BY created_at, id
    `);
    const rows = await stmt.all(refoldUserId, ...statuses);
    return rows as PendingAnkiCardRow[];
  }

  /**
   * Claim a card for flushing. Succeeds only when the card is queued, or is
   * stuck in 'flushing' with a stale claim. Returns true when the claim won.
   */
  public async claim(id: number, sessionId: string): Promise<boolean> {
    const statements = this.getStatements();
    const result = await statements.claim.run(sessionId, id);
    return result.changes > 0;
  }

  /**
   * Persist generated media field values for a claimed card
   */
  public async saveMediaValues(id: number, json: string): Promise<void> {
    const statements = this.getStatements();
    await statements.saveMediaValues.run(json, id);
  }

  /**
   * Mark a card successfully flushed to Anki
   */
  public async markDone(id: number, ankiNoteId: number | null): Promise<void> {
    const statements = this.getStatements();
    await statements.markDone.run(ankiNoteId, id);
  }

  /**
   * Mark a card failed; increments the attempt counter and clears the claim
   */
  public async markError(id: number, error: string): Promise<void> {
    const statements = this.getStatements();
    await statements.markError.run(error, id);
  }

  /**
   * Return a card to the queue and clear its claim
   */
  public async release(id: number): Promise<void> {
    const statements = this.getStatements();
    await statements.release.run(id);
  }

  /**
   * Delete a user's pending card. Refuses rows currently being flushed.
   * Returns true when a row was deleted.
   */
  public async deletePending(
    id: number,
    refoldUserId: number,
  ): Promise<boolean> {
    const statements = this.getStatements();
    const result = await statements.deletePending.run(id, refoldUserId);
    return result.changes > 0;
  }
}
