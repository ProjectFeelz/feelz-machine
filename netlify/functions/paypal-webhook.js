const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // needs service role to bypass RLS
);

// Verify webhook came from PayPal
async function verifyPayPalWebhook(headers, body, webhookId) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    });

    const options = {
      hostname: 'api-m.paypal.com',
      path: '/v1/notifications/verify-webhook-signature',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
        ).toString('base64')}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.verification_status === 'SUCCESS');
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

async function getTierByPlanId(planId) {
  // Map plan IDs to tier slugs
  const planMap = {
    'P-23B04242GD219860SNGUF3XQ': 'pro',
    'P-9ED159925B232625WNGUF53Q': 'premium',
  };
  const slug = planMap[planId];
  if (!slug) return null;

  const { data } = await supabase
    .from('platform_tiers')
    .select('*')
    .eq('slug', slug)
    .single();

  return data;
}

async function getArtistBySubscriptionId(subscriptionId) {
  const { data } = await supabase
    .from('artist_tier_subscriptions')
    .select('*, artists(*)')
    .eq('paypal_subscription_id', subscriptionId)
    .single();
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const body = event.body;
  const headers = event.headers;

  // Verify webhook signature
  if (webhookId) {
    const isValid = await verifyPayPalWebhook(headers, body, webhookId);
    if (!isValid) {
      console.error('Invalid PayPal webhook signature');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  let eventData;
  try {
    eventData = JSON.parse(body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventType = eventData.event_type;
  const resource = eventData.resource;

  console.log('PayPal webhook received:', eventType);

  try {
    switch (eventType) {

      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const subscriptionId = resource.id;
        const planId = resource.plan_id;
        const payerId = resource.subscriber?.payer_id;

        const tier = await getTierByPlanId(planId);
        if (!tier) {
          console.error('Unknown plan ID:', planId);
          break;
        }

        // Find existing pending subscription record
        const { data: existingSub } = await supabase
          .from('artist_tier_subscriptions')
          .select('*')
          .eq('paypal_subscription_id', subscriptionId)
          .single();

        if (existingSub) {
          // Activate it
          await supabase
            .from('artist_tier_subscriptions')
            .update({
              status: 'active',
              tier_id: tier.id,
              paypal_payer_id: payerId,
              started_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSub.id);

          // Update artist tier
          await supabase
            .from('artists')
            .update({ current_tier_id: tier.id, updated_at: new Date().toISOString() })
            .eq('id', existingSub.artist_id);

          // Send notification
          await supabase.from('notifications').insert({
            artist_id: existingSub.artist_id,
            type: 'subscription_activated',
            title: `Welcome to ${tier.name}!`,
            message: `Your ${tier.name} plan is now active. Enjoy your new features!`,
            metadata: { tier_slug: tier.slug },
          });
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const subscriptionId = resource.id;
        const sub = await getArtistBySubscriptionId(subscriptionId);

        if (sub) {
          // Deactivate subscription
          await supabase
            .from('artist_tier_subscriptions')
            .update({
              status: eventType === 'BILLING.SUBSCRIPTION.CANCELLED' ? 'cancelled' : 'expired',
              updated_at: new Date().toISOString(),
            })
            .eq('paypal_subscription_id', subscriptionId);

          // Get free tier
          const { data: freeTier } = await supabase
            .from('platform_tiers')
            .select('id')
            .eq('slug', 'free')
            .single();

          // Downgrade artist to free
          if (freeTier) {
            await supabase
              .from('artists')
              .update({ current_tier_id: freeTier.id, updated_at: new Date().toISOString() })
              .eq('id', sub.artist_id);
          }

          // Notify artist
          await supabase.from('notifications').insert({
            artist_id: sub.artist_id,
            type: 'subscription_cancelled',
            title: 'Subscription ended',
            message: 'Your plan has been downgraded to Free. Upgrade anytime to restore access.',
            metadata: {},
          });
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const subscriptionId = resource.id;
        const sub = await getArtistBySubscriptionId(subscriptionId);

        if (sub) {
          await supabase.from('notifications').insert({
            artist_id: sub.artist_id,
            type: 'payment_failed',
            title: 'Payment failed',
            message: 'Your subscription payment failed. Please update your PayPal payment method.',
            metadata: {},
          });
        }
        break;
      }

      default:
        console.log('Unhandled event type:', eventType);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: 'OK' };
};
