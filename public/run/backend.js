/*
  FEELZ RUN - ONLINE SERVICES
  The game runs at www.feelzmachine.com/run and shares the Feelz Machine
  sign-in: if you're signed in on Feelz Machine you're signed in here, and
  signing in goes through Feelz Machine's own login page (email and password,
  email link, Google, or Plugin Gallery). Settings are in config.js (BACKEND).

  Scores, unlocks, credits and vouchers are all checked and worked out on the
  server, so a player editing this file cannot give themselves anything.
*/

"use strict";

const Backend = (() => {
  const onSite = BACKEND.hosts.includes(location.hostname);
  const online = !!(onSite && BACKEND.supabaseUrl && BACKEND.supabaseKey && window.supabase && window.supabase.createClient);
  let client = null;
  let user = null;
  const listeners = [];

  if (online) {
    // Same project and the same default storage as the Feelz Machine app, so the
    // session is shared between the two.
    client = window.supabase.createClient(BACKEND.supabaseUrl, BACKEND.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    client.auth.onAuthStateChange((_event, session) => {
      const was = user ? user.id : null;
      user = session ? session.user : null;
      if ((user ? user.id : null) !== was) listeners.forEach(fn => fn(user));
    });
  }

  async function init() {
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      user = data && data.session ? data.session.user : null;
    } catch (e) { user = null; }
    return user;
  }

  async function rpc(name, args) {
    if (!client) throw new Error("Play at feelzmachine.com/run to use your Feelz Machine account.");
    const { data, error } = await client.rpc(name, args || {});
    if (error) throw new Error(error.message || "Something went wrong. Try again.");
    return data;
  }

  async function accessToken() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  return {
    online,
    init,
    onChange(fn) { listeners.push(fn); },
    isSignedIn: () => !!user,
    user: () => user,

    // Feelz Machine's own sign-in and sign-up, then straight back to the game.
    loginUrl(signup) {
      return BACKEND.loginPath + "?redirect=" + encodeURIComponent(BACKEND.gamePath) + (signup ? "&mode=signup" : "");
    },
    async signOut() { if (client) await client.auth.signOut(); user = null; listeners.forEach(fn => fn(null)); },

    me: () => rpc("game_me"),
    startRun: missionId => rpc("game_start_run", { mission: missionId }),
    submitRun: run => rpc("game_submit_run", run),
    leaderboard: (missionId, period, limit) => rpc("game_leaderboard", { mission: missionId, period, max_rows: limit || 50 }),
    updatePlayer: (playerName, country) => rpc("game_update_player", { new_name: playerName, new_country: country || null }),
    unlock: skillId => rpc("game_unlock", { skill: skillId }),
    setStyle: (outfit, dance) => rpc("game_set_style", { new_outfit: outfit, new_dance: dance }),
    convert: () => rpc("game_convert"),
    buyVoucher: (trackId, percent) => rpc("game_buy_voucher", { track: trackId, pct: percent }),

    // Buying a song with a voucher goes through Feelz Machine's own PayPal checkout.
    async paypalClientId() {
      const res = await fetch("/.netlify/functions/game-config");
      if (!res.ok) throw new Error("PayPal is briefly unavailable. Try again shortly.");
      const data = await res.json();
      if (!data.paypalClientId) throw new Error("PayPal is briefly unavailable. Try again shortly.");
      return data.paypalClientId;
    },
    async createOrder(trackId, voucherCode, title) {
      const res = await fetch("/.netlify/functions/paypal-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", trackId, voucher: voucherCode, trackTitle: title, artistName: "Big Feelz" })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.orderId) throw new Error(data.error || "Couldn't start the payment. Nothing was charged.");
      return data;
    },
    async captureOrder(orderId) {
      const res = await fetch("/.netlify/functions/paypal-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "capture", orderId, userId: user ? user.id : null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "The payment didn't go through.");
      return data;
    },
    accessToken,

    // Player 2 in a race on the same screen: a separate sign-in that's never saved
    // in this browser, used only to show their player name above them.
    async signInSecond(email, password) {
      if (!online) throw new Error("Play at feelzmachine.com/run to sign in.");
      const second = window.supabase.createClient(BACKEND.supabaseUrl, BACKEND.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "feelzrun-player2" }
      });
      const { error } = await second.auth.signInWithPassword({ email, password });
      if (error) throw new Error("That email and password didn't work. Type a name instead if you like.");
      const { data, error: e2 } = await second.rpc("game_me");
      await second.auth.signOut().catch(() => {});
      if (e2 || !data) throw new Error("Signed in, but couldn't load the player name.");
      return data.player_name || (email.split("@")[0] || "P2").slice(0, 16);
    }
  };
})();
