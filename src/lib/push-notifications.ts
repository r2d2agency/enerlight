/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_URL || '';

// Check if push notifications are supported
export function supportsPushNotifications(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Get current permission status
export function getPushPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Request notification permission
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return await Notification.requestPermission();
}

// Get VAPID public key from backend
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const data = await api<{ publicKey: string }>('/api/push/vapid-public-key');
    return data.publicKey;
  } catch (err) {
    console.error('Failed to get VAPID key:', err);
    return null;
  }
}

// Convert URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscribe to push notifications
export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!supportsPushNotifications()) {
      console.warn('Push notifications not supported');
      return false;
    }

    const permission = await requestPushPermission();
    if (permission !== 'granted') {
      console.warn('Push notification permission denied');
      return false;
    }

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      console.error('No VAPID key available');
      return false;
    }

    // Register the push service worker
    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let subscription = await (registration as any).pushManager.getSubscription();

    if (!subscription) {
      subscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    // Send subscription to backend
    await api('/api/push/subscribe', {
      method: 'POST',
      body: { subscription: subscription.toJSON() },
    });

    console.log('Push subscription successful');
    return true;
  } catch (err) {
    console.error('Push subscription error:', err);
    return false;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await (registration as any).pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api('/api/push/unsubscribe', {
        method: 'POST',
        body: { endpoint },
      });
    }

    return true;
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return false;
  }
}

// Check if currently subscribed
export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!supportsPushNotifications()) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await (registration as any).pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
