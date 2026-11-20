function createDailyLock(driver) {
  let constraint;
  return async function withDailyLock(dateKey, action) {
    if (!constraint) {
      const session = driver.session();
      constraint = session.run(
        'CREATE CONSTRAINT daily_question_date IF NOT EXISTS FOR (d:DailyQuestion) REQUIRE d.dateKey IS UNIQUE'
      ).then(() => session.run(
        'CREATE CONSTRAINT daily_question_node_date IF NOT EXISTS FOR (q:Question) REQUIRE q.dayKey IS UNIQUE'
      )).finally(() => session.close()).catch(error => {
        constraint = null;
        throw error;
      });
    }
    await constraint;
    const session = driver.session();
    const transaction = session.beginTransaction();
    try {
      const lock = await transaction.run(`
        MERGE (d:DailyQuestion {dateKey: $dateKey})
        SET d.lockVersion = coalesce(d.lockVersion, 0) + 1
        RETURN coalesce(d.completed, false) AS completed
      `, { dateKey });
      const result = await action(lock.records[0].get('completed'));
      if (!result) throw new Error('No daily question was saved.');
      await transaction.run('MATCH (d:DailyQuestion {dateKey: $dateKey}) SET d.completed = true', { dateKey });
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      await session.close();
    }
  };
}

module.exports = createDailyLock;
