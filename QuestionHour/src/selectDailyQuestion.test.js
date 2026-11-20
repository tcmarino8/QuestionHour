const selectDailyQuestion = require('../server/selectDailyQuestion');

const date = value => value.slice(0, 10);
const ai = { text: 'AI', current: true, aiGenerated: true, responseCount: 0, createdAt: '2026-11-19T02:00:00Z' };
const fallback = { text: 'Fallback', current: true, aiGenerated: false, responseCount: 0, createdAt: '2026-11-19T03:00:00Z' };

test('prefers the AI question when duplicate current questions have no responses', () => {
  expect(selectDailyQuestion([fallback, ai], '2026-11-19', date)).toBe(ai);
});

test('preserves a current question with responses over an unanswered AI question', () => {
  const answered = { ...fallback, responseCount: 1 };
  expect(selectDailyQuestion([answered, ai], '2026-11-19', date)).toBe(answered);
});

test('does not replace a single current question with an archived question', () => {
  expect(selectDailyQuestion([fallback, { ...ai, current: false }], '2026-11-19', date)).toBe(fallback);
});

test('selects only questions from the requested day', () => {
  expect(selectDailyQuestion([fallback, ai], '2026-11-20', date)).toBeNull();
});
