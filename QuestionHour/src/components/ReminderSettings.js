import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../services/api';
import './ReminderSettings.css';

const TOKEN_KEY = 'daily-dose-reminder-token';
const TIME_KEY = 'daily-dose-reminder-time';

function decodeKey(value) {
  const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Reminder request failed.');
  return data;
}

export default function ReminderSettings() {
  const [time, setTime] = useState(() => localStorage.getItem(TIME_KEY) || '08:30');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const supported = window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration('/').then(async registration => {
      const subscription = registration && await registration.pushManager.getSubscription();
      setEnabled(Boolean(subscription && localStorage.getItem(TOKEN_KEY) && Notification.permission === 'granted'));
    }).catch(error => console.error('Could not inspect reminder subscription:', error));
  }, [supported]);

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const { publicKey } = await request('/api/reminders/config');
      const registration = await navigator.serviceWorker.register('/reminder-sw.js');
      const ready = await navigator.serviceWorker.ready;
      if (ready.scope !== registration.scope) throw new Error('Another service worker controls this site.');
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
      let token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        token = Array.from(window.crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(TOKEN_KEY, token);
      }
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await request('/api/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), token, time, timeZone })
      });
      localStorage.setItem(TIME_KEY, time);
      setEnabled(true);
      setMessage(`Daily reminder set for ${time} in ${timeZone}.`);
    } catch (error) {
      console.error('Could not enable reminders:', error);
      setMessage(error.message || 'Could not enable reminders.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration && await registration.pushManager.getSubscription();
      const token = localStorage.getItem(TOKEN_KEY);
      if (subscription && token) {
        await request('/api/reminders', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint, token })
        });
        await subscription.unsubscribe();
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TIME_KEY);
      setEnabled(false);
      setMessage('Daily reminder disabled on this device.');
    } catch (error) {
      console.error('Could not disable reminders:', error);
      setMessage(error.message || 'Could not disable reminders.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reminder-settings" aria-label="Daily reminder settings">
      <label htmlFor="reminder-time">Daily reminder (your local time)</label>
      <select id="reminder-time" value={time} onChange={event => setTime(event.target.value)} disabled={!supported || busy}>
        <option value="08:30">8:30 AM</option>
        <option value="12:30">12:30 PM</option>
        <option value="17:30">5:30 PM</option>
      </select>
      <button type="button" onClick={save} disabled={!supported || busy}>
        {enabled ? 'Update reminder' : 'Enable reminder'}
      </button>
      {enabled && <button type="button" onClick={disable} disabled={busy}>Turn off</button>}
      {!supported && <span>Push notifications require a supported browser and HTTPS. On iPhone, add the app to your Home Screen first.</span>}
      {message && <span role="status">{message}</span>}
    </section>
  );
}
