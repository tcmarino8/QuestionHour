jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) }));
const webPush = require('web-push');
const { validateReminder, localMinute, isAllowedPushEndpoint, createReminderRoutes } = require('../server/reminders');

const reminder = {
  time: '08:30', timeZone: 'America/Los_Angeles', token: 'a'.repeat(64),
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) }
  }
};

test('validates reminder data and rejects non-push endpoints', () => {
  expect(() => validateReminder(reminder)).not.toThrow();
  expect(() => validateReminder({ ...reminder, time: '09:30' })).toThrow();
  expect(() => validateReminder({ ...reminder, timeZone: 'Invalid/Zone' })).toThrow();
  expect(() => validateReminder({ ...reminder, token: 'short' })).toThrow();
  expect(isAllowedPushEndpoint('https://fcm.googleapis.com.example.com/x')).toBe(false);
  expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
  expect(isAllowedPushEndpoint('https://example.push.apple.com/x')).toBe(true);
});

test('matches local time across daylight saving transitions', () => {
  expect(localMinute(new Date('2026-03-08T15:30:00Z'), 'America/Los_Angeles'))
    .toEqual({ date: '2026-03-08', time: '08:30' });
  expect(localMinute(new Date('2026-11-01T16:30:00Z'), 'America/Los_Angeles'))
    .toEqual({ date: '2026-11-01', time: '08:30' });
});

test('authenticated dispatch sends at most one reminder per local day', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-03-08T15:30:00Z'));
  process.env.VAPID_PUBLIC_KEY = 'public';
  process.env.VAPID_PRIVATE_KEY = 'private';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  process.env.CRON_SECRET = 'test-secret';
  const routes = {};
  const app = {
    get: (path, handler) => { routes[path] = handler; },
    put: () => {},
    delete: () => {}
  };
  let claimed = false;
  const runQuery = jest.fn(async query => {
    if (query.startsWith('MATCH (r:PushReminder)')) {
      return [{ get: () => ({ properties: {
        id: 'test', endpoint: reminder.subscription.endpoint,
        p256dh: reminder.subscription.keys.p256dh, auth: reminder.subscription.keys.auth,
        time: reminder.time, timeZone: reminder.timeZone
      } }) }];
    }
    if (query.includes('lastAttemptDate')) {
      if (claimed) return [];
      claimed = true;
      return [{ get: () => 'test' }];
    }
    return [];
  });
  const res = () => {
    const response = { statusCode: 200 };
    response.status = code => { response.statusCode = code; return response; };
    response.json = body => { response.body = body; return response; };
    return response;
  };
  createReminderRoutes(app, runQuery);
  const dispatch = routes['/api/reminders/dispatch'];
  const denied = res();
  await dispatch({ headers: {} }, denied);
  expect(denied.statusCode).toBe(403);
  const first = res();
  const second = res();
  await dispatch({ headers: { authorization: 'Bearer test-secret' } }, first);
  await dispatch({ headers: { authorization: 'Bearer test-secret' } }, second);
  expect(first.body.sent).toBe(1);
  expect(second.body.sent).toBe(0);
  expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
  expect(JSON.parse(webPush.sendNotification.mock.calls[0][1]).body).toBe('Would you like your daily dose now?');
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  delete process.env.CRON_SECRET;
  jest.useRealTimers();
});
