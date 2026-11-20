const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { themes, themeIdToNatural, selectTargetHeadlines, buildHeadlineRequest } = require('../server/questionGeneration');

const MAX_HEADLINES = 15;
const DAY_MS = 86400000;
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function losAngelesDateKey(date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parsePastDate(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Enter a date in YYYY-MM-DD format.');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Enter a valid calendar date.');
  }
  if (value >= losAngelesDateKey(now)) {
    throw new Error('Enter a date before today in Los Angeles.');
  }
  return date;
}

function dateOffset(date, days) {
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function decodeXml(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || match;
    const number = entity[1].toLowerCase() === 'x'
      ? parseInt(entity.slice(2), 16)
      : parseInt(entity.slice(1), 10);
    return number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number)
      : match;
  }).trim();
}

function xmlField(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!match) return '';
  return decodeXml(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1'));
}

function parseHeadlines(rss, selectedDate) {
  const firstDay = dateOffset(selectedDate, -6);
  const lastDay = dateOffset(selectedDate, 0);
  const seen = new Set();
  const headlines = [];
  for (const raw of rss.split('<item>').slice(1)) {
    const item = raw.split('</item>')[0];
    const title = xmlField(item, 'title');
    const link = xmlField(item, 'link');
    const publishedAt = new Date(xmlField(item, 'pubDate'));
    if (!title || !link || !Number.isFinite(publishedAt.getTime()) || seen.has(title)) continue;
    const dateKey = losAngelesDateKey(publishedAt);
    if (dateKey < firstDay || dateKey > lastDay) continue;
    headlines.push({
      title,
      source: xmlField(item, 'source'),
      link,
      publishedAt: publishedAt.toISOString()
    });
    seen.add(title);
  }
  return headlines.slice(0, MAX_HEADLINES);
}

async function fetchHeadlines(selectedDate, naturalTheme, fetchImpl) {
  // Broaden the provider search around LA midnight, then enforce the exact LA date window locally.
  const query = `latest ${naturalTheme} after:${dateOffset(selectedDate, -8)} before:${dateOffset(selectedDate, 2)}`;
  const params = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  const response = await fetchImpl(`https://news.google.com/rss/search?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Google News request failed (HTTP ${response.status}).`);
  const headlines = parseHeadlines(await response.text(), selectedDate);
  if (!headlines.length) {
    throw new Error('Google News returned no dated articles in the selected seven-day window. Try another date; older coverage may be unavailable.');
  }
  return headlines;
}

async function generateQuestion(headlines, naturalTheme, apiKey, fetchImpl) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing. Set it in the environment or the application .env file.');
  const body = buildHeadlineRequest(headlines, naturalTheme);
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const code = data?.error?.code;
    const safeCode = typeof code === 'string' && /^[a-z0-9_-]+$/i.test(code) ? `, ${code}` : '';
    throw new Error(`OpenAI request failed (HTTP ${response.status}${safeCode}).`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned no question text.');
  if (!data.id || !data.model) throw new Error('OpenAI response did not include its response ID and model.');
  return { text, model: data.model, id: data.id };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node TylerTestingNewsScraper\\test-question-generation.js [YYYY-MM-DD]');
    return;
  }
  if (process.argv.length > 3) throw new Error('Provide at most one date in YYYY-MM-DD format.');
  let dateInput = process.argv[2];
  if (!dateInput) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      dateInput = (await rl.question('Past date in Los Angeles (YYYY-MM-DD): ')).trim();
    } finally {
      rl.close();
    }
  }
  const date = parsePastDate(dateInput);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const theme = themes[date.getUTCDay()];
  console.log(`Date: ${dateInput} (${weekday}, Los Angeles)`);
  console.log(`Theme: ${theme}`);

  if (theme === 'reflection') {
    console.log("Sunday is Reflection Day in the application; it does not call GPT or use news.");
    console.log("Reflection Day: Review this week's questions and your answers.");
    return;
  }

  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const result = require('dotenv').config({ path: envPath });
    if (result.error) throw result.error;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing. Set it in the environment or the application .env file.');
  }
  const fetchImpl = (await import('node-fetch')).default;
  const naturalTheme = themeIdToNatural(theme);
  const headlines = await fetchHeadlines(date, naturalTheme, fetchImpl);
  const target = selectTargetHeadlines(headlines);
  console.log(`News window: ${dateOffset(date, -6)} through ${dateInput} (Los Angeles calendar dates)`);
  console.log(`Eligible headlines in Google News order (${headlines.length}):`);
  headlines.forEach((headline, index) => {
    const marker = target.indexes.includes(index) ? ' [target]' : '';
    console.log(`${index + 1}. ${headline.title}${marker}`);
    console.log(`   ${headline.source || 'Unknown source'} | ${headline.publishedAt} | ${headline.link}`);
  });
  console.log(target.reason === 'similar-headlines'
    ? `Selection: ${target.headlines.length} headlines share at least two significant words.`
    : 'Selection: no cluster of at least three; using the first Google News result.');
  console.log('\nRequesting a statement from OpenAI...');
  const result = await generateQuestion(headlines, naturalTheme, process.env.OPENAI_API_KEY, fetchImpl);
  console.log(`\nGPT model: ${result.model}`);
  console.log(`OpenAI response ID: ${result.id}`);
  console.log(`Generated statement: ${result.text}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { losAngelesDateKey, parsePastDate, parseHeadlines, fetchHeadlines, generateQuestion };
