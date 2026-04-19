/**
 * usePushNotifications.js
 *
 * Handles Web Push subscription lifecycle:
 *   - Checks browser support
 *   - Requests permission
 *   - Subscribes via VAPID public key
 *   - Stores subscription in Supabase push_subscriptions table
 *   - Unsubscribes on request
 *
 * Returns: { supported, permission, subscribed, subscribing, subscribe, unsubscribe }
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotifications(user) {
  const [supported,    setSupported]    = useState(false);
  const [permission,   setPermission]   = useState('default');
  const [subscribed,   setSubscribed]   = useState(false);
  const [subscribing,  setSubscribing]  = useState(false);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
  }, []);

  // Check if already subscribed
  useEffect(() => {
    if (!supported || !user) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setSubscribed(!!sub);
    }).catch(() => {});
  }, [supported, user]);

  const subscribe = useCallback(async () => {
    if (!supported || !user || subscribing) return false;
    setSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      setPermission(permission);
      if (permission !== 'granted') { setSubscribing(false); return false; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const key    = sub.getKey('p256dh');
      const auth   = sub.getKey('auth');
      const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
      const authStr = btoa(String.fromCharCode(...new Uint8Array(auth)));

      await supabase.from('push_subscriptions').upsert({
        user_id:  user.id,
        endpoint: sub.endpoint,
        p256dh:   p256dh,
        auth:     authStr,
      }, { onConflict: 'user_id,endpoint' });

      setSubscribed(true);
      setSubscribing(false);
      return true;
    } catch (err) {
      console.error('Push subscribe error:', err);
      setSubscribing(false);
      return false;
    }
  }, [supported, user, subscribing]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete()
          .eq('user_id', user.id).eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    }
  }, [supported, user]);

  return { supported, permission, subscribed, subscribing, subscribe, unsubscribe };
}