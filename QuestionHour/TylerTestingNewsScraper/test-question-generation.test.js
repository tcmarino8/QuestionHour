const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { themes, selectTargetHeadlines, buildHeadlineRequest } = require('../server/questionGeneration');
const {
  losAngelesDateKey,
  parsePastDate,
  parseHeadlines,
  fetchHeadlines,
  generateQuestion
} = require('./test-question-generation');

const now = new Date('2025-11-20T20:00:00Z');
const selected = parsePastDate('2025-11-17', now);
const item = (title, date) =>
  `<item><title>${title}</title><link>https://news.example/${title}</link><pubDate>${date}</pubDate><source>Example</source></item>`;

test('validates past LA dates and matches production weekdays', () => {
  assert.deepEqual(themes, [
    'reflection', 'science_nature', 'history_politics', 'technology_innovation',
    'arts_culture', 'society_ethics', 'sports'
  ]);
  assert.equal(themes[selected.getUTCDay()], 'science_nature');
  assert.equal(themes[parsePastDate('2025-11-16', now).getUTCDay()], 'reflection');
  for (const invalid of ['2025-02-30', '2025-11-20', '2025-11-21', '11/17/2025', '']) {
    assert.throws(() => parsePastDate(invalid, now));
  }
  assert.equal(losAngelesDateKey(new Date('2025-11-18T07:59:59Z')), '2025-11-17');
  assert.equal(losAngelesDateKey(new Date('2025-11-18T08:00:00Z')), '2025-11-18');
  assert.equal(losAngelesDateKey(new Date('2025-03-10T07:00:00Z')), '2025-03-10');
});

test('shared production request retains the daily generation prompt and settings', () => {
  assert.deepEqual(buildHeadlineRequest([{ title: 'News headline' }], 'science and nature'), {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You generate one concise, neutral civic question from headlines.' },
      { role: 'user', content: `You will generate ONE concise, neutral statement (<= 140 chars) for public discussion that people can AGREE or DISAGREE with.
    
Theme: science and nature
Target story headlines:
- News headline

Guidelines:
- Output a single balanced statement (not a question).
- Focus on one specific issue, action, or policy from the target story, not the broad theme.
- Make the statement clear and debatable for a general audience.
- Do not assume facts not supported by the headlines.
- Avoid naming individuals unless essential.
- Output ONLY the statement, without quotes.` }
    ],
    temperature: 0.4,
    max_tokens: 80
  });
});

test('filters articles to the seven LA calendar days and decodes titles', () => {
  const rss = `<rss>${[
    item('In &amp; window', 'Tue, 18 Nov 2025 07:59:59 GMT'),
    item('Too late', 'Tue, 18 Nov 2025 08:00:00 GMT'),
    item('First day', 'Tue, 11 Nov 2025 08:00:00 GMT'),
    item('Too early', 'Tue, 11 Nov 2025 07:59:59 GMT'),
    item('No date', 'not-a-date'),
    item('In &amp; window', 'Mon, 17 Nov 2025 10:00:00 GMT')
  ].join('')}</rss>`;
  const articles = parseHeadlines(rss, selected);
  assert.deepEqual(articles.map(article => article.title), ['In & window', 'First day']);
  assert.equal(articles[0].source, 'Example');
  assert.equal(articles[0].publishedAt, '2025-11-18T07:59:59.000Z');
});

test('limits the news input to 15 articles, preserving Google News order', () => {
  const rss = Array.from({ length: 20 }, (_, index) =>
    item(`Article ${index}`, `Mon, 17 Nov 2025 ${String(index).padStart(2, '0')}:00:00 GMT`)
  ).join('');
  const articles = parseHeadlines(rss, selected);
  assert.equal(articles.length, 15);
  assert.equal(articles[0].title, 'Article 0');
  assert.equal(articles[14].title, 'Article 14');
});

test('selects a group of at least three headlines on the same issue', () => {
  const headlines = [
    { title: 'State lawmakers consider housing reform' },
    { title: 'Congress debates coastal flood insurance' },
    { title: 'Coastal flood insurance costs rise' },
    { title: 'Coastal flood insurance proposal divides lawmakers' },
    { title: 'A new battery breakthrough' }
  ];
  const result = selectTargetHeadlines(headlines);
  assert.equal(result.reason, 'similar-headlines');
  assert.deepEqual(result.indexes, [1, 2, 3]);
  const prompt = buildHeadlineRequest(headlines, 'society and ethics').messages[1].content;
  assert.match(prompt, /Coastal flood insurance proposal/);
  assert.doesNotMatch(prompt, /housing reform|battery breakthrough/);
});

test('uses first result when only two similar headlines exist', () => {
  const headlines = [
    { title: 'First unrelated result' },
    { title: 'Coastal flood insurance costs rise' },
    { title: 'Coastal flood insurance proposal divides lawmakers' }
  ];
  assert.deepEqual(selectTargetHeadlines(headlines), {
    reason: 'first-result', indexes: [0], headlines: [headlines[0]]
  });
  const prompt = buildHeadlineRequest(headlines, 'society and ethics').messages[1].content;
  assert.match(prompt, /First unrelated result/);
  assert.doesNotMatch(prompt, /Coastal flood insurance/);
});

test('selects the largest cluster and resolves ties by original ranking', () => {
  const headlines = [
    'City transit budget proposal',
    'Coastal flood insurance costs rise',
    'City transit budget approved',
    'Coastal flood insurance rules change',
    'City transit budget debate',
    'Coastal flood insurance proposal'
  ].map(title => ({ title }));
  assert.deepEqual(selectTargetHeadlines(headlines).indexes, [0, 2, 4]);
  headlines.push({ title: 'Coastal flood insurance reform' });
  assert.deepEqual(selectTargetHeadlines(headlines).indexes, [1, 3, 5, 6]);
});

test('ignores publisher suffixes and does not join stories through unrelated overlaps', () => {
  const headlines = [
    { title: 'School funding grows - Daily News', source: 'Daily News' },
    { title: 'Housing costs soar - Daily News', source: 'Daily News' },
    { title: 'Airport delays worsen - Daily News', source: 'Daily News' }
  ];
  assert.equal(selectTargetHeadlines(headlines).reason, 'first-result');
  assert.throws(() => selectTargetHeadlines([]), /At least one headline/);
});

test('Google News failures and empty results never fall back to local questions', async () => {
  await assert.rejects(fetchHeadlines(selected, 'science and nature', async () => ({
    ok: false,
    status: 503
  })), /HTTP 503/);
  await assert.rejects(fetchHeadlines(selected, 'science and nature', async () => ({
    ok: true,
    text: async () => '<rss></rss>'
  })), /no dated articles/i);
});

test('sends the production request to OpenAI and returns its model and response ID', async () => {
  const headlines = [{ title: 'News headline' }];
  let request;
  const result = await generateQuestion(headlines, 'science and nature', 'test-key', async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        id: 'chatcmpl-test',
        model: 'gpt-4o-mini-test',
        choices: [{ message: { content: ' A generated statement. ' } }]
      })
    };
  });
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(request.options.body), buildHeadlineRequest(headlines, 'science and nature'));
  assert.deepEqual(result, { text: 'A generated statement.', model: 'gpt-4o-mini-test', id: 'chatcmpl-test' });
});

test('missing keys, OpenAI failures, and incomplete replies are explicit failures', async () => {
  const headlines = [{ title: 'News headline' }];
  await assert.rejects(generateQuestion([], 'sports', '', async () => {}), /OPENAI_API_KEY is missing/);
  await assert.rejects(generateQuestion(headlines, 'sports', 'test-key', async () => ({
    ok: false, status: 401, json: async () => ({ error: { code: 'invalid_api_key' } })
  })), /HTTP 401, invalid_api_key/);
  await assert.rejects(generateQuestion(headlines, 'sports', 'test-key', async () => ({
    ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] })
  })), /response ID and model/);
});

test('Sunday returns the production reflection without requiring news or a key', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'test-question-generation.js'), '2025-11-16'], {
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: '' }
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /does not call GPT or use news/);
  assert.match(result.stdout, /Review this week's questions/);
});
