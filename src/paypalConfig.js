// PayPal Configuration
// Replace with your actual PayPal credentials
// Get these from https://developer.paypal.com/dashboard/applications

const PAYPAL_CONFIG = {
  // Set to 'sandbox' for testing, 'live' for production
  mode: 'sandbox',

  // Your PayPal Client ID (from PayPal Developer Dashboard)
  clientId: process.env.REACT_APP_PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID_HERE',

  // PayPal Plan IDs for each tier (create these in PayPal Dashboard → Subscriptions)
  // Each plan should be set up as a recurring yearly subscription
  planIds: {
    pro: process.env.REACT_APP_PAYPAL_PRO_PLAN_ID || 'YOUR_PRO_PLAN_ID',
    premium: process.env.REACT_APP_PAYPAL_PREMIUM_PLAN_ID || 'YOUR_PREMIUM_PLAN_ID',
  },

  // Platform PayPal email (receives tier subscription payments)
  platformEmail: 'steve@projectfeelz.com',
};

// PayPal SDK script URL
export const getPayPalScriptUrl = () => {
  const base = 'https://www.paypal.com/sdk/js';
  const params = new URLSearchParams({
    'client-id': PAYPAL_CONFIG.clientId,
    vault: 'true',
    intent: 'subscription',
  });
  return `${base}?${params.toString()}`;
};

export default PAYPAL_CONFIG;
