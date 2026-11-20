const createDailyLock = require('../server/dailyLock');

test('acquires a database lock, invokes generation and commits the daily marker', async () => {
  const run = jest.fn()
    .mockResolvedValueOnce({ records: [{ get: () => false }] })
    .mockResolvedValueOnce({});
  const transaction = { run, commit: jest.fn(), rollback: jest.fn() };
  const close = jest.fn();
  const driver = { session: jest.fn(() => ({
    run: jest.fn().mockResolvedValue({}), close, beginTransaction: () => transaction
  })) };
  const action = jest.fn().mockResolvedValue({ text: 'Question' });
  const result = await createDailyLock(driver)('2026-11-19', action);
  expect(result.text).toBe('Question');
  expect(action).toHaveBeenCalledWith(false);
  expect(run).toHaveBeenCalledTimes(2);
  expect(transaction.commit).toHaveBeenCalledTimes(1);
  expect(transaction.rollback).not.toHaveBeenCalled();
});

test('rolls back if generation fails', async () => {
  const transaction = {
    run: jest.fn().mockResolvedValue({ records: [{ get: () => false }] }),
    commit: jest.fn(), rollback: jest.fn()
  };
  const driver = { session: () => ({
    run: jest.fn().mockResolvedValue({}), close: jest.fn(), beginTransaction: () => transaction
  }) };
  await expect(createDailyLock(driver)('2026-11-19', async () => { throw new Error('failure'); })).rejects.toThrow('failure');
  expect(transaction.rollback).toHaveBeenCalledTimes(1);
  expect(transaction.commit).not.toHaveBeenCalled();
});

test('concurrent instances reuse the completed daily question after the database lock', async () => {
  let locked = Promise.resolve();
  let completed = false;
  const driver = { session: () => ({
    run: jest.fn().mockResolvedValue({}),
    close: jest.fn(),
    beginTransaction: () => {
      let release;
      return {
        run: jest.fn(async query => {
          if (query.includes('MERGE (d:DailyQuestion')) {
            const previous = locked;
            locked = new Promise(resolve => { release = resolve; });
            await previous;
            return { records: [{ get: () => completed }] };
          }
          completed = true;
          return {};
        }),
        commit: async () => release(),
        rollback: async () => release()
      };
    }
  }) };
  let generated = 0;
  const action = async alreadyCompleted => {
    if (!alreadyCompleted) {
      await new Promise(resolve => setTimeout(resolve, 5));
      generated++;
    }
    return { text: 'same question' };
  };
  const first = createDailyLock(driver);
  const second = createDailyLock(driver);
  const results = await Promise.all([first('2026-11-19', action), second('2026-11-19', action)]);
  expect(results.map(result => result.text)).toEqual(['same question', 'same question']);
  expect(generated).toBe(1);
});
