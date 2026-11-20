require('dotenv').config();
const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');
const path = require('path');
const app = express();
const fs = require('fs');
const cron = require('node-cron');
const validateResponseBody = require('./validateResponseBody');
const selectDailyQuestion = require('./selectDailyQuestion');
const createDailyLock = require('./dailyLock');
const { createReminderRoutes } = require('./reminders');
const { themes, themeIdToNatural, selectTargetHeadlines, buildHeadlineRequest } = require('./questionGeneration');
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MAX_HEADLINES_FOR_QUESTION = 15;
const MAX_HEADLINE_PARSE_LIMIT = 30;
const LA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const LA_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'long'
});
const WEEKDAY_TO_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};


// Neo4j connection
let driver;
try {
  driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
  );
  console.log('Neo4j connection established successfully');
} catch (error) {
  console.error('Failed to create Neo4j driver:', error);
  process.exit(1);
}
const withDailyLock = createDailyLock(driver);

// Helper function to run Neo4j queries
async function runQuery(query, params = {}) {
  const session = driver.session();
  try {
    // console.log('Executing Neo4j query:', query);
    // console.log('With parameters:', params);
    const result = await session.run(query, params);
    // console.log('Query result summary:', result.summary);
    // console.log('Number of records returned:', result.records.length);
    // if (result.records.length > 0) {
    //   console.log('First record:', result.records[0].toObject());
    // }
    return result.records;
  } catch (error) {
    console.error('Neo4j query error:', error);
    throw error;
  } finally {
    await session.close();
  }
  createReminderRoutes(app, runQuery);
}

function toIsoString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  return String(value);
}

function toLosAngelesDateKey(isoValue) {
  if (!isoValue) return '';
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return '';

  return LA_DATE_FORMATTER.format(parsed);
}

function getTodayLosAngelesDateKey() {
  return LA_DATE_FORMATTER.format(new Date());
}

const recentQuestionsQuery = `
  MATCH (q:Question)
  WHERE q.text IS NOT NULL
  WITH q ORDER BY q.createdAt DESC LIMIT 50
  OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
  RETURN q, count(r) AS responseCount
  ORDER BY q.createdAt DESC
`;

function findDailyRecord(records, dateKey) {
  const candidates = records.map(record => {
    const node = record.get('q');
    const count = record.get('responseCount');
    return {
      ...node.properties,
      createdAt: toIsoString(node.properties.createdAt),
      responseCount: count.toNumber(),
      record
    };
  });
  return selectDailyQuestion(candidates, dateKey, toLosAngelesDateKey)?.record;
}

async function markCurrentQuestion(node, theme) {
  return runQuery(`
    MATCH (q:Question)
    WHERE elementId(q) = $questionId
    OPTIONAL MATCH (other:Question {current: true})
    WHERE other <> q
    WITH q, collect(other) AS others
    FOREACH (other IN others | SET other.current = false, other.archivedAt = datetime())
    SET q.current = true,
        q.theme = $theme,
        q.aiGenerated = coalesce(q.aiGenerated, false),
        q.updatedAt = datetime()
    RETURN q
  `, { questionId: node.elementId, theme });
}

// Get all responses
app.get('/api/responses', async (req, res) => {
  try {
    const query = `
      MATCH (q:Question)-[:HAS_RESPONSE]->(r:Response)
      RETURN r
      ORDER BY r.timestamp DESC
    `;
    const records = await runQuery(query);
    const responses = records.map(record => record.get('r').properties);
    res.json(responses);
  } catch (error) {
    console.error('Error fetching responses:', error);
    res.status(500).json({ error: 'Failed to fetch responses', details: error.message });
  }
});

// Get responses for current question only
app.get('/api/questions/current/responses', async (req, res) => {
  console.log('GET /api/questions/current/responses - Request received');
  try {
    const query = `
      MATCH (q:Question {current: true})-[:HAS_RESPONSE]->(r:Response)
      RETURN r
      ORDER BY r.timestamp DESC
    `;
    console.log('Executing query to find responses for current question');
    const records = await runQuery(query);
    const responses = records.map(record => record.get('r').properties);
    console.log(`Found ${responses.length} responses for current question`);
    res.json(responses);
  } catch (error) {
    console.error('Error fetching current question responses:', error);
    res.status(500).json({ error: 'Failed to fetch current question responses', details: error.message });
  }
});

// Get aggregated live stack buckets by LA day.
// Buckets merge all responses from questions created on the same LA day.
app.get('/api/questions/live-stack', async (req, res) => {
  console.log('GET /api/questions/live-stack - Request received');

  try {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 1), 14)
      : 7;

    const requestedLookback = Number.parseInt(req.query.lookbackDays, 10);
    const lookbackDays = Number.isFinite(requestedLookback)
      ? Math.min(Math.max(requestedLookback, days), 365)
      : 45;

    const query = `
      MATCH (q:Question)
      WHERE q.createdAt >= datetime() - duration({days: $lookbackDays})
      OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
      RETURN q, r
      ORDER BY q.createdAt ASC, r.timestamp ASC
    `;

    const records = await runQuery(query, { lookbackDays: neo4j.int(lookbackDays) });

    const dayBuckets = new Map();

    records.forEach((record) => {
      const questionNode = record.get('q');
      if (!questionNode) return;

      const q = questionNode.properties || {};
      const questionCreatedAt = toIsoString(q.createdAt);
      const dayKey = q.dayKey || toLosAngelesDateKey(questionCreatedAt);
      if (!dayKey) return;

      if (!dayBuckets.has(dayKey)) {
        dayBuckets.set(dayKey, {
          dateKey: dayKey,
          dayTimestamp: `${dayKey}T00:00:00`,
          questionEntries: [],
          questionSet: new Set(),
          responseSet: new Set(),
          responses: []
        });
      }

      const bucket = dayBuckets.get(dayKey);
      const questionText = q.text || '';

      if (questionText && !bucket.questionSet.has(questionText)) {
        bucket.questionSet.add(questionText);
        bucket.questionEntries.push({
          text: questionText,
          theme: q.theme || 'general',
          createdAt: questionCreatedAt
        });
      }

      const responseNode = record.get('r');
      if (responseNode) {
        const r = responseNode.properties || {};
        const responseId = responseNode.elementId || `${toIsoString(r.timestamp)}-${r.location || ''}-${questionText}`;
        if (bucket.responseSet.has(responseId)) {
          return;
        }

        bucket.responseSet.add(responseId);
        bucket.responses.push({
          response: r.response,
          timestamp: toIsoString(r.timestamp),
          location: r.location,
          lat: r.lat,
          lng: r.lng,
          question: questionText
        });
      }
    });

    const layers = Array.from(dayBuckets.values())
      .filter((bucket) => bucket.responses.length > 0)
      .map((bucket) => {
        bucket.questionEntries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const firstQuestion = bucket.questionEntries[0] || { text: 'Daily aggregate', theme: 'general' };

        const agreeCount = bucket.responses.filter((r) => r.response === 'agree').length;
        const disagreeCount = bucket.responses.filter((r) => r.response === 'disagree').length;
        const reflectedCount = bucket.responses.filter((r) => r.response === 'reflected').length;

        return {
          dateKey: bucket.dateKey,
          timestamp: bucket.dayTimestamp,
          displayQuestionText: firstQuestion.text,
          displayTheme: firstQuestion.theme || 'general',
          questionCount: bucket.questionSet.size,
          questionTexts: bucket.questionEntries.map((entry) => entry.text),
          responseCount: bucket.responses.length,
          agreeCount,
          disagreeCount,
          reflectedCount,
          responses: bucket.responses
        };
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, days);

    return res.json({
      daysRequested: days,
      lookbackDays,
      count: layers.length,
      layers
    });
  } catch (error) {
    console.error('Error fetching aggregated live stack:', error);
    return res.status(500).json({ error: 'Failed to fetch live stack', details: error.message });
  }
});

// Add a new response
app.post('/api/responses', async (req, res) => {
  try {
    validateResponseBody(req.body);
    const { question, response, timestamp, location, lat, lng } = req.body;
    const allowedResponses = ['agree', 'disagree', 'reflected'];

    if (!allowedResponses.includes(response)) {
      return res.status(400).json({
        error: 'Failed to add response',
        details: `Response must be one of: ${allowedResponses.join(', ')}`
      });
    }
    
    const responseQuery = `
      MATCH (q:Question {text: $question, current: true})
      CREATE (r:Response {
        response: $response,
        timestamp: $timestamp,
        location: $location,
        lat: $lat,
        lng: $lng
      })
      CREATE (q)-[:HAS_RESPONSE]->(r)
      WITH r
      OPTIONAL MATCH (other:Response {location: $location})
      WHERE other <> r
      FOREACH (_ IN CASE WHEN other IS NULL THEN [] ELSE [1] END |
        MERGE (r)-[:SAME_ZIP]->(other)
      )
      RETURN DISTINCT r
    `;
    const responseResult = await runQuery(responseQuery, {
      question,
      response,
      timestamp,
      location,
      lat,
      lng
    });
    
    if (!responseResult || responseResult.length === 0) {
      throw new Error('Failed to create response node');
    }
    
    const responseData = responseResult[0].get('r').properties;
    res.json(responseData);
  } catch (error) {
    console.error('Error adding response:', error);
    res.status(400).json({ 
      error: 'Failed to add response', 
      details: error.message 
    });
  }
});

// Reset all data
app.delete('/api/responses', async (req, res) => {
  // Admin authentication check
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];
  if (!adminSecret || providedSecret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: Invalid or missing admin secret.' });
  }
  try {
    const query = `
      MATCH (n)
      DETACH DELETE n
    `;
    await runQuery(query);
    res.json({ message: 'All data reset successfully' });
  } catch (error) {
    console.error('Error resetting data:', error);
    res.status(500).json({ error: 'Failed to reset data', details: error.message });
  }
});

// Get current question
app.get('/api/questions/current', async (req, res) => {
  console.log('GET /api/questions/current - Request received');
  console.log("Req.body ", req.body)
  try {
    const laTodayDateKey = getTodayLosAngelesDateKey();
    const laYesterdayDateKey = toLosAngelesDateKey(new Date(Date.now() - 86400000).toISOString());

    console.log('Checking for today\'s question');
    const recentQuestionRecords = await runQuery(recentQuestionsQuery);
    const getRecordForDateKey = (dateKey) => findDailyRecord(recentQuestionRecords, dateKey);

    let result = [];
    const todaysRecord = getRecordForDateKey(laTodayDateKey);
    if (todaysRecord) {
      result = [todaysRecord];
    }
    
    if (result.length === 0) {
      // If no question from today, check for current question
      const currentQuery = `
        MATCH (q:Question {current: true})
        WHERE q.text IS NOT NULL
        RETURN q
      `;
      
      console.log('No question from today, checking current question');
      result = await runQuery(currentQuery);

      if (result.length > 0) {
        const currentProps = result[0].get('q')?.properties || {};
        const currentDateKey = toLosAngelesDateKey(toIsoString(currentProps.createdAt));
        if (currentDateKey !== laTodayDateKey) {
          console.log('Current question is stale for LA day, rotating it now');
          result = [];
        }
      }
      
      // Only generate a new question if we don't have a valid one and it's after noon PST
      if (result.length === 0) {
        const isPastNoon = getLosAngelesHour() >= 12;
        
        if (isPastNoon) {
          console.log('No current question found and past noon PST, generating new one');
          await setQuestionOfTheDay();
          result = await runQuery(currentQuery);
        } else {
          console.log('No current question found but before noon PST, using yesterday\'s question');
          const yesterdayRecord = getRecordForDateKey(laYesterdayDateKey);
          result = yesterdayRecord ? [yesterdayRecord] : [];
        }
      }
    } else {
      // If found today's question, ensure it's marked as current and has the correct theme
      const todayTheme = getTodayTheme();
      const todaysNode = result[0].get('q');
      console.log('Found today\'s question, ensuring it\'s marked as current with theme:', todayTheme);
      result = await markCurrentQuestion(todaysNode, todayTheme);
    }
    
    if (result.length === 0) {
      console.log('Still no question found after attempts');
      return res.status(404).json({ error: 'No current question found' });
    }
    
    const questionData = result[0].get('q').properties;
    console.log('Returning question data:', questionData);
    res.json(questionData);
  } catch (error) {
    console.error('Error fetching current question:', error);
    res.status(500).json({ error: 'Failed to fetch current question' });
  }
});



function getTodayTheme() {
  // Compute day of week in Los Angeles timezone without locale-string parsing.
  const weekdayName = LA_WEEKDAY_FORMATTER.format(new Date()).toLowerCase();
  const day = WEEKDAY_TO_INDEX[weekdayName] ?? 0;
  return themes[day];
}

function getLosAngelesHour() {
  const hourString = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false
  }).format(new Date());

  const hour = Number.parseInt(hourString, 10);
  return Number.isFinite(hour) ? hour : 0;
}

function resolveThemeId(themeInput) {
  if (!themeInput || typeof themeInput !== 'string') return getTodayTheme();

  const normalized = themeInput.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (themes.includes(normalized)) return normalized;

  const aliasToTheme = {
    science: 'science_nature',
    nature: 'science_nature',
    science_and_nature: 'science_nature',
    politics: 'history_politics',
    history: 'history_politics',
    history_and_politics: 'history_politics',
    technology: 'technology_innovation',
    innovation: 'technology_innovation',
    technology_and_innovation: 'technology_innovation',
    arts: 'arts_culture',
    culture: 'arts_culture',
    arts_and_culture: 'arts_culture',
    society: 'society_ethics',
    ethics: 'society_ethics',
    society_and_ethics: 'society_ethics'
  };

  return aliasToTheme[normalized] || getTodayTheme();
}

// Testable endpoint: returns today's theme id and natural-language text
app.get('/api/themes/today', (req, res) => {
  try {
    const id = getTodayTheme();
    console.log(id)
    const natural = themeIdToNatural(id);
    res.json({ id, natural });
  } catch (e) {
    console.error('Error resolving today\'s theme:', e);
    res.status(500).json({ error: 'Failed to resolve today\'s theme' });
  }
});

function normalizeProvidedHeadlines(input, limit = MAX_HEADLINES_FOR_QUESTION) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === 'string') {
        return { title: item.trim() };
      }
      if (!item || typeof item !== 'object') return null;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title) return null;
      return {
        title,
        source: typeof item.source === 'string' ? item.source.trim() : '',
        link: typeof item.link === 'string' ? item.link.trim() : ''
      };
    })
    .filter((item) => item && item.title)
    .slice(0, limit);
}

// Fetch recent Google News headlines for a theme (server-side)
app.get('/api/news/headlines', async (req, res) => {
  try {
    const themeParam = req.query.theme; // natural language optional override
    const location = req.query.location; // optional, e.g., "United States" or city/state

    const themeId = resolveThemeId(themeParam);
    const naturalTheme = themeIdToNatural(themeId);
    const headlines = await fetchHeadlinesForTheme(naturalTheme, location, MAX_HEADLINES_FOR_QUESTION);

    return res.json({ themeId, naturalTheme, count: headlines.length, headlines });
  } catch (e) {
    console.error('Error fetching headlines:', e);
    return res.status(500).json({ error: 'Failed to fetch headlines' });
  }
});

// Generate a neutral, concise question from up to 15 headlines using an LLM
app.post('/api/news/generate-question', async (req, res) => {
  return res.status(409).json({ error: 'Daily generation is automatic. Use the standalone historical tester for experiments.' });
});
// Helpers used by scheduler
async function fetchHeadlinesForTheme(naturalTheme, location, limit = MAX_HEADLINES_FOR_QUESTION) {
  const parts = ['latest', naturalTheme];
  if (location && String(location).trim().length > 0) parts.push(`in ${String(location).trim()}`);
  const searchQuery = encodeURIComponent(parts.join(' '));
  // tbs=qdr:w filters results to the past week (qdr = query date range, w = week)
  const url = `https://news.google.com/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en&tbs=qdr:w`;
  const rssUrl = `https://news.google.com/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`;

  const decodeHtml = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  };

  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }
  const headlines = [];
  const seen = new Set();

  // Primary path: RSS is more stable than Google News HTML for server-side parsing.
  const rssResp = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  if (rssResp.ok) {
    const rss = await rssResp.text();
    const rssItems = rss.split('<item>').slice(1);

    for (const raw of rssItems) {
      const item = raw.split('</item>')[0] || raw;
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
      const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      const title = titleMatch ? decodeHtml(titleMatch[1]) : '';
      if (!title || seen.has(title)) continue;

      const link = linkMatch ? decodeHtml(linkMatch[1]) : '';
      if (!link) continue;

      const source = sourceMatch ? decodeHtml(sourceMatch[1]) : '';
      headlines.push({ title, source, link });
      seen.add(title);

      if (headlines.length >= Math.min(limit, MAX_HEADLINE_PARSE_LIMIT)) break;
    }
  }

  // Fallback path: if RSS parsing yields nothing, try HTML scraping.
  if (headlines.length === 0) {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    if (resp.ok) {
      const html = await resp.text();
      const items = html.split('<article').slice(1);
      for (const raw of items) {
        const item = '<article' + raw;
        const titleMatch = item.match(/aria-label="More\s-\s(.*?)"/);
        const sourceMatch = item.match(/data-n-tid="9">(.*?)<\/div>/);
        const hrefMatch = item.match(/href="(.*?)"/);
        const title = titleMatch ? decodeHtml(titleMatch[1]) : '';
        if (!title || seen.has(title)) continue;
        let link = hrefMatch ? decodeHtml(hrefMatch[1]) : '';
        if (!link) continue;
        if (link.startsWith('.')) link = 'https://news.google.com' + link.substring(1);
        const source = sourceMatch ? decodeHtml(sourceMatch[1]) : '';
        headlines.push({ title, source, link });
        seen.add(title);
        if (headlines.length >= Math.min(limit, MAX_HEADLINE_PARSE_LIMIT)) break;
      }
    }
  }

  return headlines.slice(0, limit);
}

async function generateQuestionFromHeadlines(headlines, naturalTheme) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }
  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }
  const body = buildHeadlineRequest(headlines, naturalTheme);
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`OpenAI request failed (HTTP ${resp.status})`);
  const data = await resp.json();
  const question = data?.choices?.[0]?.message?.content?.trim();
  if (!question) throw new Error('No question text');
  return {
    text: question,
    aiGenerated: true
  };
}

let generationInProgress;

function setQuestionOfTheDay() {
  if (!generationInProgress) {
    const dateKey = getTodayLosAngelesDateKey();
    generationInProgress = withDailyLock(dateKey, completed => generateQuestionOfTheDay(dateKey, completed)).finally(() => {
      generationInProgress = null;
    });
  }
  return generationInProgress;
}

async function generateQuestionOfTheDay(todayDateKey, completed) {
  if (getTodayLosAngelesDateKey() !== todayDateKey) {
    throw new Error('The Los Angeles day changed before generation began; retry for the new day.');
  }
  const theme = getTodayTheme();
  
  try {
    const recentQuestions = await runQuery(recentQuestionsQuery);
    const todaysRecord = findDailyRecord(recentQuestions, todayDateKey);

    if (todaysRecord) {
      console.log('Question for today already exists, using it');
      // Make sure it's marked as current and has the correct theme
      const result = await markCurrentQuestion(todaysRecord.get('q'), theme);
      return result[0].get('q').properties;
    }
  } catch (e) {
    console.error('Error checking for existing question:', e);
    throw e;
  }
  if (completed) {
    throw new Error('The daily question was already generated but is no longer available; refusing to generate another.');
  }
  // Sunday: Reflection day — set a reflection placeholder instead of a debate question
  if (theme === 'reflection') {
    const reflectionText = 'Reflection Day: Review this week\'s questions and your answers.';
    const createReflectionQuery = `
      CREATE (q:Question {text: $text, dayKey: $dayKey})
      SET q.current = true,
          q.theme = $theme,
          q.aiGenerated = false,
          q.createdAt = datetime(),
          q.totalResponses = 0,
          q.agreeCount = 0,
          q.disagreeCount = 0,
          q.reflectedCount = 0
      RETURN q
    `;
    try {
      const result = await runQuery(createReflectionQuery, { text: reflectionText, theme, dayKey: todayDateKey });
      await markCurrentQuestion(result[0].get('q'), theme);
      return { text: reflectionText, theme };
    } catch (e) {
      console.error('Error creating reflection day placeholder:', e);
      throw e;
    }
  }

  // Other days: try news-driven question first
  const questionsPath = path.join(__dirname, 'questions.json');
  let naturalTheme = themeIdToNatural(theme);
  let generated;
  let selectedHeadlines;
  try {
    const headlines = await fetchHeadlinesForTheme(naturalTheme);
    if (headlines && headlines.length > 0) {
      generated = await generateQuestionFromHeadlines(headlines, naturalTheme);
      if (getTodayLosAngelesDateKey() !== todayDateKey) {
        throw new Error('The Los Angeles day changed during generation; retry for the new day.');
      }
      if (!generated?.text) throw new Error('OpenAI returned no question text');
      selectedHeadlines = selectTargetHeadlines(headlines).headlines;
    } else {
      throw new Error('No current news headlines were available');
    }
  } catch (e) {
    console.error('News-driven generation failed:', e.message || e);
    if (getTodayLosAngelesDateKey() !== todayDateKey) throw e;
    if (process.env.ALLOW_LOCAL_QUESTION_FALLBACK !== 'true') {
      throw e;
    }
    console.warn('Using local question fallback because ALLOW_LOCAL_QUESTION_FALLBACK is enabled');
  }

  if (generated) {
    const createQuery = `
      CREATE (q:Question {text: $text, dayKey: $dayKey})
      SET q.createdAt = datetime(), q.theme = $theme, q.aiGenerated = true,
          q.totalResponses = 0, q.agreeCount = 0, q.disagreeCount = 0,
          q.reflectedCount = 0, q.current = true, q.sourcesJson = $sourcesJson,
          q.updatedAt = datetime()
      RETURN q
    `;
    const result = await runQuery(createQuery, {
      text: generated.text, dayKey: todayDateKey, theme, sourcesJson: JSON.stringify(selectedHeadlines)
    });
    await markCurrentQuestion(result[0].get('q'), theme);
    return { text: generated.text, theme };
  }

  // Fallback: pick a question from the local pool by theme
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  const filtered = questions.filter(q => q.theme === theme);
  if (filtered.length === 0) {
    console.log('No questions found for theme:', theme);
    throw new Error(`No fallback questions found for theme: ${theme}`);
  }
  const selected = filtered[Math.floor(Math.random() * filtered.length)];

  const sourcesJson = JSON.stringify([]);

  const createQuery = `
    CREATE (q:Question {text: $text, dayKey: $dayKey})
    SET q.current = true,
        q.theme = $theme,
        q.aiGenerated = false,
        q.createdAt = datetime(),
        q.totalResponses = 0,
        q.agreeCount = 0,
        q.disagreeCount = 0,
        q.reflectedCount = 0,
        q.sourcesJson = $sourcesJson
    RETURN q
  `;
  try {
    const result = await runQuery(createQuery, { text: selected.text, theme: selected.theme, sourcesJson, dayKey: todayDateKey });
    await markCurrentQuestion(result[0].get('q'), selected.theme);
    return selected;
  } catch (e) {
    console.error('Error creating scheduled question of the day (fallback):', e);
    throw e;
  }
}

// Run at midnight PST every day (00:00 PM America/Los_Angeles)
cron.schedule('0 0 * * *', setQuestionOfTheDay, {
  timezone: 'America/Los_Angeles'
});

// Also run once on server start to ensure there is a current item
setQuestionOfTheDay().catch(error => console.error('Initial question generation failed:', error.message));

// Set new current question
app.post('/api/questions/current', async (req, res) => {
  return res.status(409).json({ error: 'The current daily question cannot be replaced.' });
});
// Get question history with detailed statistics
app.get('/api/questions/history', async (req, res) => {
  console.log('GET /api/questions/history - Request received');
  try {
    const query = `
      MATCH (q:Question)
      WHERE q.current = false
      WITH DISTINCT q
      OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
      WITH q, collect(r) as allResponses,
           [r in collect(r) WHERE r.response = 'agree'] as agreeResponses,
           [r in collect(r) WHERE r.response = 'disagree'] as disagreeResponses,
         [r in collect(r) WHERE r.response = 'reflected'] as reflectedResponses,
           collect(DISTINCT r.location) as uniqueLocations
      RETURN {
        id: q.id,
        text: q.text,
        theme: q.theme,
        createdAt: toString(q.createdAt),
        current: q.current,
        responses: [r in allResponses | {
          response: r.response,
          timestamp: toString(r.timestamp),
          location: r.location,
          lat: r.lat,
          lng: r.lng
        }],
        totalResponses: size(allResponses),
        agreeCount: size(agreeResponses),
        disagreeCount: size(disagreeResponses),
        reflectedCount: size(reflectedResponses),
        uniqueLocations: size(uniqueLocations)
      } as questionData
      ORDER BY q.createdAt DESC
    `;
    
    console.log('Fetching question history with responses from Neo4j');
    const result = await runQuery(query);
    console.log('Found', result.length, 'archived questions with responses');
    
    const history = result.map(record => record.get('questionData'));
    res.json(history);
  } catch (error) {
    console.error('Error fetching question history:', error);
    res.status(500).json({ error: 'Failed to fetch question history' });
  }
});

// Get detailed statistics for a specific question
app.get('/api/questions/:text/stats', async (req, res) => {
  console.log('GET /api/questions/:text/stats - Request received');
  try {
    const { text } = req.params;
    const query = `
      MATCH (q:Question {text: $text})
      WITH q
      OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
      WITH q, 
           count(r) as totalResponses,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'agree'}) | r]) as agreeCount,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'disagree'}) | r]) as disagreeCount,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'reflected'}) | r]) as reflectedCount,
           collect(DISTINCT r.location) as locations
      RETURN q {
        .*,
        totalResponses: totalResponses,
        agreeCount: agreeCount,
        disagreeCount: disagreeCount,
        reflectedCount: reflectedCount,
        uniqueLocations: size(locations),
        locations: locations
      }
    `;
    
    console.log('Fetching statistics for question:', text);
    const result = await runQuery(query, { text });
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json(result[0].get('q'));
  } catch (error) {
    console.error('Error fetching question statistics:', error);
    res.status(500).json({ error: 'Failed to fetch question statistics' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let neo4jReady = false;
  try {
    await runQuery('RETURN 1 as ok');
    neo4jReady = true;
  } catch (e) {
    neo4jReady = false;
  }

  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const adminSecretConfigured = Boolean(process.env.ADMIN_SECRET);
  const status = neo4jReady ? 'ok' : 'degraded';

  res.status(neo4jReady ? 200 : 503).json({
    status,
    dependencies: {
      neo4j: neo4jReady ? 'up' : 'down',
      openai: openAiConfigured ? 'configured' : 'missing_key',
      adminSecret: adminSecretConfigured ? 'configured' : 'missing'
    },
    headlines: {
      targetCount: MAX_HEADLINES_FOR_QUESTION
    }
  });
});

// Catch-all route - MUST BE LAST
app.get('/', (req, res) => {
  res.send('Server is running');
});

// Admin trigger to run generation now (secured by ADMIN_SECRET)
app.post('/api/admin/generate-today', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];
  if (!adminSecret || providedSecret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: Invalid or missing admin secret.' });
  }
  try {
    const result = await setQuestionOfTheDay();
    res.json({ ok: true, result });
  } catch (e) {
    console.error('Manual generation failed:', e);
    res.status(500).json({ ok: false, error: e.message || 'failed' });
  }
});

// Admin hard-delete the current question node (DETACH DELETE)
app.delete('/api/admin/current-question', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];
  if (!adminSecret || providedSecret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: Invalid or missing admin secret.' });
  }
  return res.status(409).json({ error: 'Deleting the current question would violate the daily question guardrail.' });
});

// One-time admin endpoint: backfill missing aiGenerated flags on historical questions
app.post('/api/admin/backfill-ai-generated', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];
  if (!adminSecret || providedSecret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: Invalid or missing admin secret.' });
  }

  try {
    const taskName = 'backfill_ai_generated_v1';

    const alreadyRanQuery = `
      MATCH (t:AdminTask {name: $taskName})
      RETURN t.completedAt AS completedAt, t.updatedCount AS updatedCount
      LIMIT 1
    `;
    const alreadyRanResult = await runQuery(alreadyRanQuery, { taskName });

    if (alreadyRanResult.length > 0) {
      const completedAt = alreadyRanResult[0].get('completedAt');
      const updatedCountRaw = alreadyRanResult[0].get('updatedCount');
      const updatedCount = typeof updatedCountRaw?.toNumber === 'function'
        ? updatedCountRaw.toNumber()
        : Number(updatedCountRaw || 0);

      return res.status(409).json({
        ok: false,
        message: 'This one-time backfill has already been run.',
        taskName,
        completedAt,
        updatedCount
      });
    }

    const updateQuery = `
      MATCH (q:Question)
      WHERE q.aiGenerated IS NULL
      SET q.aiGenerated = false
      RETURN count(q) AS updatedCount
    `;
    const updateResult = await runQuery(updateQuery);
    const updatedCountRaw = updateResult[0]?.get('updatedCount');
    const updatedCount = typeof updatedCountRaw?.toNumber === 'function'
      ? updatedCountRaw.toNumber()
      : Number(updatedCountRaw || 0);

    const markCompleteQuery = `
      MERGE (t:AdminTask {name: $taskName})
      SET t.completedAt = datetime(),
          t.updatedCount = $updatedCount
      RETURN t
    `;
    await runQuery(markCompleteQuery, { taskName, updatedCount });

    return res.json({
      ok: true,
      message: 'aiGenerated backfill completed successfully.',
      taskName,
      updatedCount
    });
  } catch (e) {
    console.error('Error running aiGenerated backfill:', e);
    return res.status(500).json({ ok: false, error: e.message || 'failed' });
  }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});