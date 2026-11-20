const crypto = require('crypto');
const webPush = require('web-push');

const TIMES = new Set(['08:30', '12:30', '17:30']);
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);

function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith('.push.apple.com'));
  } catch {
    return false;
  }
}

function localMinute(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}` };
}

function validateReminder(body) {
  if (!body || !TIMES.has(body.time)) throw new Error('Invalid reminder time.');
  if (typeof body.timeZone !== 'string' || body.timeZone.length > 100) throw new Error('Invalid time zone.');
  try { localMinute(new Date(), body.timeZone); } catch { throw new Error('Invalid time zone.'); }
  const subscription = body.subscription;
  if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048 ||
      !isAllowedPushEndpoint(subscription.endpoint) ||
      typeof subscription.keys?.p256dh !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys.p256dh) ||
      typeof subscription.keys?.auth !== 'string' || !/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys.auth)) {
    throw new Error('Invalid push subscription.');
  }
  if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) throw new Error('Invalid subscription token.');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function configure() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error('Push notifications are not configured on the server.');
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return VAPID_PUBLIC_KEY;
}

function createReminderRoutes(app, runQuery) {
  let constraint;
  const ensureConstraint = () => {
    if (!constraint) {
      constraint = runQuery(
        'CREATE CONSTRAINT push_reminder_id IF NOT EXISTS FOR (r:PushReminder) REQUIRE r.id IS UNIQUE'
      ).catch(error => { constraint = null; throw error; });
    }
    return constraint;
  };
  app.get('/api/reminders/config', (req, res) => {
    try { res.json({ publicKey: configure() }); }
    catch (error) { console.error('Reminder configuration error:', error.message); res.status(503).json({ error: error.message }); }
  });

  app.put('/api/reminders', async (req, res) => {
    try {
      configure();
      validateReminder(req.body);
      await ensureConstraint();
      const { subscription, token, time, timeZone } = req.body;
      const id = hash(subscription.endpoint);
      const tokenHash = hash(token);
      const result = await runQuery(`
        MERGE (r:PushReminder {id: $id})
        ON CREATE SET r.tokenHash = $tokenHash
        WITH r WHERE r.tokenHash = $tokenHash
        SET r.endpoint = $endpoint, r.p256dh = $p256dh, r.auth = $auth,
            r.time = $time, r.timeZone = $timeZone
        RETURN r.id AS id
      `, { id, tokenHash, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth, time, timeZone });
      if (!result.length) return res.status(403).json({ error: 'Subscription belongs to another device.' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Reminder subscription error:', error.message);
      return res.status(400).json({ error: 'Could not save reminder. Check the time, browser settings, and server configuration.' });
    }
  });

  app.delete('/api/reminders', async (req, res) => {
    const { endpoint, token } = req.body || {};
    if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint) ||
        typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid subscription.' });
    }
    try {
      await runQuery('MATCH (r:PushReminder {id: $id, tokenHash: $tokenHash}) DETACH DELETE r', {
        id: hash(endpoint), tokenHash: hash(token)
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Reminder removal error:', error.message);
      return res.status(500).json({ error: 'Could not remove reminder.' });
    }
  });

  app.get('/api/reminders/dispatch', async (req, res) => {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      configure();
      const records = await runQuery('MATCH (r:PushReminder) RETURN r');
      let sent = 0;
      let failed = 0;
      const now = new Date();
      for (const record of records) {
        const reminder = record.get('r').properties;
        const local = localMinute(now, reminder.timeZone);
        if (local.time !== reminder.time) continue;
        const claimed = await runQuery(`
          MATCH (r:PushReminder {id: $id})
          SET r.lockVersion = coalesce(r.lockVersion, 0) + 1
          WITH r WHERE r.lastAttemptDate IS NULL OR r.lastAttemptDate <> $date
          SET r.lastAttemptDate = $date
          RETURN r.id AS id
        `, { id: reminder.id, date: local.date });
        if (!claimed.length) continue;
        try {
          await webPush.sendNotification({
            endpoint: reminder.endpoint,
            keys: { p256dh: reminder.p256dh, auth: reminder.auth }
          }, JSON.stringify({ title: 'Your Daily Dose', body: 'Would you like your daily dose now?' }), { TTL: 300 });
          sent++;
        } catch (error) {
          failed++;
          console.error('Push delivery failed:', error.statusCode || error.message);
          if (error.statusCode === 404 || error.statusCode === 410) {
            await runQuery('MATCH (r:PushReminder {id: $id}) DETACH DELETE r', { id: reminder.id });
          }
        }
      }
      return res.status(failed ? 502 : 200).json({ ok: failed === 0, sent, failed });
    } catch (error) {
      console.error('Reminder dispatch failed:', error.message);
      return res.status(500).json({ error: 'Reminder dispatch failed.' });
    }
  });
}

module.exports = { createReminderRoutes, validateReminder, localMinute, isAllowedPushEndpoint };
