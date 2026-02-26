import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

// Public: get VAPID public key (no auth needed)
router.get('/vapid-public-key', async (req, res) => {
  try {
    // Check env first
    if (process.env.VAPID_PUBLIC_KEY) {
      return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
    }
    // Check DB
    const result = await pool.query('SELECT public_key FROM push_vapid_keys ORDER BY created_at DESC LIMIT 1');
    if (result.rows.length > 0) {
      return res.json({ publicKey: result.rows[0].public_key });
    }
    // Auto-generate if web-push is available
    try {
      const webpush = await import('web-push');
      const vapidKeys = webpush.default.generateVAPIDKeys();
      await pool.query(
        'INSERT INTO push_vapid_keys (public_key, private_key) VALUES ($1, $2)',
        [vapidKeys.publicKey, vapidKeys.privateKey]
      );
      return res.json({ publicKey: vapidKeys.publicKey });
    } catch (e) {
      return res.status(500).json({ error: 'VAPID keys not configured and web-push not available' });
    }
  } catch (err) {
    console.error('Error getting VAPID key:', err);
    res.status(500).json({ error: err.message });
  }
});

// Protected routes
router.use(authenticate);

// Subscribe to push notifications
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW()`,
      [req.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, req.headers['user-agent'] || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error subscribing to push:', err);
    res.status(500).json({ error: err.message });
  }
});

// Unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.userId, endpoint]);
    } else {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.userId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error unsubscribing:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get subscription status
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = $1',
      [req.userId]
    );
    res.json({ subscribed: parseInt(result.rows[0].count) > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

// Utility function to send push notification to a user
export async function sendPushToUser(userId, payload) {
  try {
    const webpush = await import('web-push');

    // Get VAPID keys
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    
    if (!publicKey || !privateKey) {
      const vapidResult = await pool.query('SELECT public_key, private_key FROM push_vapid_keys ORDER BY created_at DESC LIMIT 1');
      if (vapidResult.rows.length === 0) return;
      publicKey = vapidResult.rows[0].public_key;
      privateKey = vapidResult.rows[0].private_key;
    }

    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@enerlight.com.br';
    webpush.default.setVapidDetails(vapidEmail, publicKey, privateKey);

    // Get user's subscriptions
    const subs = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
    
    const notificationPayload = JSON.stringify(payload);

    for (const sub of subs.rows) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      try {
        await webpush.default.sendNotification(pushSubscription, notificationPayload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid, remove it
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
          console.log(`Removed expired push subscription ${sub.id}`);
        } else {
          console.error(`Push send error for sub ${sub.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('sendPushToUser error:', err.message);
  }
}
