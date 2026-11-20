function selectDailyQuestion(candidates, dateKey, getDateKey) {
  const today = candidates.filter(candidate => (candidate.dayKey || getDateKey(candidate.createdAt)) === dateKey);
  const current = today.filter(candidate => candidate.current);
  const pool = current.length ? current : today;
  if (!pool.length) return null;

  const withResponses = pool.filter(candidate => candidate.responseCount > 0);
  if (withResponses.length) return withResponses[0];
  return pool.find(candidate => candidate.aiGenerated === true) || pool[0];
}

module.exports = selectDailyQuestion;
