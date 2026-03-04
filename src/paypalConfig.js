const PAYPAL_CONFIG = {
  clientId: 'AXhUqyXxTmBJ8Q6bqt0yiOEuLxqbbhnP93YONXL5Oiy3btUntKK8M7F2WfOeUzoVPxjHEalbRRRU52yY',
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
