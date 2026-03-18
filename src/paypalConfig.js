const PAYPAL_CONFIG = {
  clientId: process.env.REACT_APP_PAYPAL_CLIENT_ID,
  planIds: {
    pro: 'P-23B04242GD219860SNGUF3XQ',
    premium: 'P-9ED159925B232625WNGUF53Q',
  },
  currency: 'USD',
  environment: 'production',
};

export const getPayPalScriptUrl = () => {
  return `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CONFIG.clientId}&vault=true&intent=subscription`;
};

export default PAYPAL_CONFIG;
