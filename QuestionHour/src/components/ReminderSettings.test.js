import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReminderSettings from './ReminderSettings';

jest.mock('../services/api', () => ({ API_BASE_URL: 'http://localhost:3001' }));

let subscription;

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window, 'crypto', { configurable: true, value: { getRandomValues: bytes => bytes.fill(7) } });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted', requestPermission: jest.fn().mockResolvedValue('granted') }
  });
  subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { auth: 'auth', p256dh: 'key' } }),
    unsubscribe: jest.fn().mockResolvedValue(true)
  };
  const registration = {
    scope: 'http://localhost/',
    pushManager: {
      getSubscription: jest.fn().mockResolvedValue(null),
      subscribe: jest.fn().mockResolvedValue(subscription)
    }
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: jest.fn().mockResolvedValue(registration),
      register: jest.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration)
    }
  });
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: 'AQ' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
});

afterEach(() => { delete global.fetch; });

test('enables a chosen reminder only after permission and saves its local time zone', async () => {
  render(<ReminderSettings />);
  fireEvent.change(screen.getByRole('combobox', { name: /daily reminder/i }), { target: { value: '12:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enable reminder' }));
  await screen.findByText(/Daily reminder set/);
  expect(Notification.requestPermission).toHaveBeenCalled();
  const payload = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(payload.time).toBe('12:30');
  expect(payload.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(payload.token).toHaveLength(64);
  expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
});

test('reports denied permission without subscribing', async () => {
  Notification.requestPermission.mockResolvedValue('denied');
  render(<ReminderSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable reminder' }));
  expect(await screen.findByText('Notification permission was not granted.')).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('turns off an existing reminder on this device', async () => {
  localStorage.setItem('daily-dose-reminder-token', 'a'.repeat(64));
  navigator.serviceWorker.getRegistration.mockResolvedValue({
    pushManager: { getSubscription: jest.fn().mockResolvedValue(subscription) }
  });
  global.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  render(<ReminderSettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
  await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalled());
  expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
  expect(await screen.findByText(/reminder disabled/i)).toBeInTheDocument();
});
