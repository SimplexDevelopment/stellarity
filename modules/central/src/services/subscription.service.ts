/**
 * Subscription Service
 * 
 * Manages user premium subscriptions.
 * Designed to integrate with Stripe or similar payment processors.
 * For now, provides the core CRUD and tier-check logic.
 */
import { query } from '../database/postgres.js';
import { logger } from '../utils/logger.js';

import type { SubscriptionTier } from '@stellarity/shared';

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

/** Premium feature limits by tier */
export const TIER_LIMITS: Record<SubscriptionTier, {
  maxInstances: number;
  maxDMBufferDays: number;
  maxFileUploadMB: number;
  voiceBitrate: number;
  customStatus: boolean;
  prioritySupport: boolean;
}> = {
  free: {
    maxInstances: 1,         // Can own 1 instance
    maxDMBufferDays: 7,      // 7-day DM buffer
    maxFileUploadMB: 10,     // 10 MB uploads
    voiceBitrate: 64000,     // 64 kbps voice
    customStatus: false,
    prioritySupport: false,
  },
  premium: {
    maxInstances: 5,
    maxDMBufferDays: 30,
    maxFileUploadMB: 100,
    voiceBitrate: 256000,
    customStatus: true,
    prioritySupport: false,
  },
  enterprise: {
    maxInstances: 50,
    maxDMBufferDays: 90,
    maxFileUploadMB: 500,
    voiceBitrate: 512000,
    customStatus: true,
    prioritySupport: true,
  },
} as const;

class SubscriptionService {
  /** Get user's current subscription */
  async getSubscription(userId: string): Promise<Subscription | null> {
    const result = await query(
      `SELECT id, user_id, tier, status, stripe_customer_id, stripe_subscription_id,
              current_period_start, current_period_end, created_at
       FROM subscriptions WHERE user_id = $1 AND status IN ('active', 'trialing')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) return null;
    return this.mapSubscription(result.rows[0]);
  }

  /** Get the user's effective subscription tier */
  async getUserTier(userId: string): Promise<SubscriptionTier> {
    const result = await query(
      'SELECT subscription_tier FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) return 'free';
    return result.rows[0].subscription_tier || 'free';
  }

  /** Get tier limits for a given tier */
  getTierLimits(tier: SubscriptionTier) {
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
  }

  /** Check if user has at least the specified tier */
  async hasMinimumTier(userId: string, requiredTier: SubscriptionTier): Promise<boolean> {
    const userTier = await this.getUserTier(userId);
    const tierOrder: SubscriptionTier[] = ['free', 'premium', 'enterprise'];
    return tierOrder.indexOf(userTier) >= tierOrder.indexOf(requiredTier);
  }

  /** Create or update a subscription (called from payment webhook) */
  async upsertSubscription(
    userId: string,
    tier: SubscriptionTier,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string,
    periodEnd?: Date
  ): Promise<Subscription> {
    // Upsert subscription
    const result = await query(
      `INSERT INTO subscriptions (user_id, tier, stripe_customer_id, stripe_subscription_id,
                                   current_period_end, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (user_id) WHERE status = 'active'
       DO UPDATE SET tier = $2, stripe_customer_id = COALESCE($3, subscriptions.stripe_customer_id),
                     stripe_subscription_id = COALESCE($4, subscriptions.stripe_subscription_id),
                     current_period_end = COALESCE($5, subscriptions.current_period_end),
                     status = 'active'
       RETURNING id, user_id, tier, status, stripe_customer_id, stripe_subscription_id,
                 current_period_start, current_period_end, created_at`,
      [userId, tier, stripeCustomerId, stripeSubscriptionId, periodEnd]
    );

    // Update user's tier field
    await query(
      `UPDATE users SET subscription_tier = $1,
              subscription_expires_at = $2
       WHERE id = $3`,
      [tier, periodEnd, userId]
    );

    logger.info(`Subscription updated for user ${userId}: ${tier}`);
    return this.mapSubscription(result.rows[0]);
  }

  /** Cancel a subscription */
  async cancelSubscription(userId: string): Promise<void> {
    await query(
      `UPDATE subscriptions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    await query(
      `UPDATE users SET subscription_tier = 'free', subscription_expires_at = NULL WHERE id = $1`,
      [userId]
    );

    logger.info(`Subscription cancelled for user ${userId}`);
  }

  /** Check how many instances a user owns (for tier-based limits) */
  async checkInstanceLimit(userId: string): Promise<{ current: number; max: number; allowed: boolean }> {
    const tier = await this.getUserTier(userId);
    const limits = this.getTierLimits(tier);

    const result = await query(
      'SELECT COUNT(*) FROM instance_registry WHERE owner_id = $1',
      [userId]
    );
    const current = parseInt(result.rows[0].count, 10);

    return {
      current,
      max: limits.maxInstances,
      allowed: current < limits.maxInstances,
    };
  }

  private mapSubscription(row: any): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      tier: row.tier,
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      createdAt: row.created_at,
    };
  }
}

export const subscriptionService = new SubscriptionService();
