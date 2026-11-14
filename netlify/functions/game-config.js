// netlify/functions/game-config.js
//
// Public settings for Feelz Run, the game at /run/. The game is plain HTML
// rather than part of the React build, so it can't read REACT_APP_* values
// baked in at build time; it asks here instead.
//
// Only PUBLIC values belong in this response. The PayPal client id is public
// (it's in every page that shows a PayPal button). Never add a secret here.

exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  body: JSON.stringify({
    paypalClientId: process.env.REACT_APP_PAYPAL_CLIENT_ID || null,
  }),
});
