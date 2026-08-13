import { DatabaseCore } from "../core";
import { UserRow, MediaUsageRow } from "@/lib/types";

/** Input for user upsert on login/entitlement sync */
export interface UpsertUserInput {
  refoldUserId: number;
  email: string;
  name: string | null;
  tier: string;
  paid: boolean;
}

/** Per-media quota limits for the user's tier */
export interface QuotaLimits {
  imageLimit: number;
  ttsLimit: number;
}

/**
 * Repository for user accounts, per-user settings, and media usage quotas
 */
export class UserRepository {
  private core: DatabaseCore;
  private statements: {
    upsertUser: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
    getUser: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
    updateEntitlements: ReturnType<
      ReturnType<DatabaseCore["getDatabase"]>["prepare"]
    >;
    getSettings: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
    putSettings: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
    getUsage: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
    upsertUsage: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
    refundUsage: ReturnType<ReturnType<DatabaseCore["getDatabase"]>["prepare"]>;
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
        upsertUser: db.prepare(`
          INSERT INTO users (refold_user_id, email, name, tier, paid, entitlements_checked_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(refold_user_id) DO UPDATE SET
            email = excluded.email,
            name = excluded.name,
            tier = excluded.tier,
            paid = excluded.paid,
            entitlements_checked_at = excluded.entitlements_checked_at,
            last_login_at = excluded.last_login_at
        `),

        getUser: db.prepare(`
          SELECT refold_user_id, email, name, tier, paid,
                 entitlements_checked_at, created_at, last_login_at
          FROM users
          WHERE refold_user_id = ?
        `),

        updateEntitlements: db.prepare(`
          UPDATE users
          SET tier = ?, paid = ?, entitlements_checked_at = datetime('now')
          WHERE refold_user_id = ?
        `),

        getSettings: db.prepare(`
          SELECT settings_json, updated_at
          FROM user_settings
          WHERE refold_user_id = ?
        `),

        putSettings: db.prepare(`
          INSERT INTO user_settings (refold_user_id, settings_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(refold_user_id) DO UPDATE SET
            settings_json = excluded.settings_json,
            updated_at = excluded.updated_at
        `),

        getUsage: db.prepare(`
          SELECT refold_user_id, period, images_used, tts_used, updated_at
          FROM media_usage
          WHERE refold_user_id = ? AND period = ?
        `),

        upsertUsage: db.prepare(`
          INSERT INTO media_usage (refold_user_id, period, images_used, tts_used, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(refold_user_id, period) DO UPDATE SET
            images_used = media_usage.images_used + excluded.images_used,
            tts_used = media_usage.tts_used + excluded.tts_used,
            updated_at = excluded.updated_at
        `),

        refundUsage: db.prepare(`
          UPDATE media_usage
          SET images_used = MAX(0, images_used - ?),
              tts_used = MAX(0, tts_used - ?),
              updated_at = datetime('now')
          WHERE refold_user_id = ? AND period = ?
        `),
      };
    }
    return this.statements;
  }

  /**
   * Create or refresh a user record on login. Updates entitlements and
   * stamps last_login_at / entitlements_checked_at.
   */
  public async upsertUser(input: UpsertUserInput): Promise<void> {
    const statements = this.getStatements();
    await statements.upsertUser.run(
      input.refoldUserId,
      input.email,
      input.name,
      input.tier,
      input.paid ? 1 : 0,
    );
  }

  public async getUser(refoldUserId: number): Promise<UserRow | null> {
    const statements = this.getStatements();
    const row = (await statements.getUser.get(refoldUserId)) as
      UserRow | undefined;
    return row ?? null;
  }

  /**
   * Update tier/paid from an entitlements check without touching login time
   */
  public async updateEntitlements(
    refoldUserId: number,
    tier: string,
    paid: boolean,
  ): Promise<boolean> {
    const statements = this.getStatements();
    const result = await statements.updateEntitlements.run(
      tier,
      paid ? 1 : 0,
      refoldUserId,
    );
    return result.changes > 0;
  }

  public async getSettings(
    refoldUserId: number,
  ): Promise<{ settingsJson: string; updatedAt: string } | null> {
    const statements = this.getStatements();
    const row = (await statements.getSettings.get(refoldUserId)) as
      { settings_json: string; updated_at: string } | undefined;
    if (!row) return null;
    return { settingsJson: row.settings_json, updatedAt: row.updated_at };
  }

  public async putSettings(
    refoldUserId: number,
    settingsJson: string,
  ): Promise<void> {
    const statements = this.getStatements();
    await statements.putSettings.run(refoldUserId, settingsJson);
  }

  public async getUsage(
    refoldUserId: number,
    period: string,
  ): Promise<MediaUsageRow | null> {
    const statements = this.getStatements();
    const row = (await statements.getUsage.get(refoldUserId, period)) as
      MediaUsageRow | undefined;
    return row ?? null;
  }

  /**
   * Atomically consume media quota for a billing period. Returns true and
   * records the usage when the request fits within the limits; returns false
   * and records nothing when it would exceed either limit. The read-check
   * and increment run inside a single transaction so concurrent consumers
   * cannot both pass the check at the boundary.
   */
  public async tryConsumeQuota(
    refoldUserId: number,
    period: string,
    images: number,
    tts: number,
    limits: QuotaLimits,
  ): Promise<boolean> {
    const db = this.core.getDatabase();
    const statements = this.getStatements();

    return db.transaction(async () => {
      const current = (await statements.getUsage.get(refoldUserId, period)) as
        MediaUsageRow | undefined;

      const imagesUsed = current?.images_used ?? 0;
      const ttsUsed = current?.tts_used ?? 0;

      if (
        imagesUsed + images > limits.imageLimit ||
        ttsUsed + tts > limits.ttsLimit
      ) {
        return false;
      }

      await statements.upsertUsage.run(refoldUserId, period, images, tts);
      return true;
    });
  }

  /**
   * Refund previously consumed quota (e.g. generation failed after
   * consuming). Usage never goes below zero.
   */
  public async refundQuota(
    refoldUserId: number,
    period: string,
    images: number,
    tts: number,
  ): Promise<void> {
    const statements = this.getStatements();
    await statements.refundUsage.run(images, tts, refoldUserId, period);
  }
}
