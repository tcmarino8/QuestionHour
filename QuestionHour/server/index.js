require('dotenv').config();
const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');
const path = require('path');
const app = express();
const fs = require('fs');
const cron = require('node-cron');
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MAX_HEADLINES_FOR_QUESTION = 15;
const MAX_HEADLINE_PARSE_LIMIT = 30;


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
}

// Validate request body
function validateResponseBody(body) {
  const required = ['question', 'response', 'timestamp', 'location', 'lat', 'lng'];
  const missing = required.filter(field => !body[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    throw new Error('lat and lng must be numbers');
  }
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

// Add a new response
app.post('/api/responses', async (req, res) => {
  try {
    const { question, response, timestamp, location, lat, lng } = req.body;
    
    // First, ensure the question exists with its properties
    const questionQuery = `
      MERGE (q:Question {text: $question})
      ON CREATE SET 
        q.createdAt = datetime(),
        // q.timestamp = datetime(),
        q.current = false,
        q.aiGenerated = false
      RETURN q
    `;
    console.log('Creating/merging question node...');
    await runQuery(questionQuery, { question });
    
    // Then create the response
    const responseQuery = `
      MATCH (q:Question {text: $question})
      CREATE (r:Response {
        response: $response,
        timestamp: $timestamp,
        location: $location,
        lat: $lat,
        lng: $lng
      })
      CREATE (q)-[:HAS_RESPONSE]->(r)
      RETURN r
    `;
    console.log('Creating response node...');
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
    
    // Finally, create SAME_ZIP relationships
    const zipQuery = `
      MATCH (r:Response {location: $location})
      MATCH (other:Response {location: $location})
      WHERE other <> r
      MERGE (r)-[:SAME_ZIP]->(other)
      RETURN r
    `;
    console.log('Creating ZIP relationships...');
    await runQuery(zipQuery, { location });
    
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
    // First check for a valid question from today
    const todayQuery = `
      MATCH (q:Question)
      WHERE date(q.createdAt) = date() AND q.text IS NOT NULL
      WITH q
      ORDER BY q.createdAt DESC
      LIMIT 1
      RETURN q
    `;
    
    console.log('Checking for today\'s question');
    let result = await runQuery(todayQuery);
    
    if (result.length === 0) {
      // If no question from today, check for current question
      const currentQuery = `
        MATCH (q:Question {current: true})
        WHERE q.text IS NOT NULL
        RETURN q
      `;
      
      console.log('No question from today, checking current question');
      result = await runQuery(currentQuery);
      
      // Only generate a new question if we don't have a valid one and it's after noon PST
      if (result.length === 0) {
        const laNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const isPastNoon = laNow.getHours() >= 12;
        
        if (isPastNoon) {
          console.log('No current question found and past noon PST, generating new one');
          await setQuestionOfTheDay();
          result = await runQuery(currentQuery);
        } else {
          console.log('No current question found but before noon PST, using yesterday\'s question');
          const yesterdayQuery = `
            MATCH (q:Question)
            WHERE date(q.createdAt) = date() - duration('P1D') AND q.text IS NOT NULL
            RETURN q
            ORDER BY q.createdAt DESC
            LIMIT 1
          `;
          result = await runQuery(yesterdayQuery);
        }
      }
    } else {
      // If found today's question, ensure it's marked as current and has the correct theme
      const todayTheme = getTodayTheme();
      const updateQuery = `
        MATCH (q:Question)
        WHERE date(q.createdAt) = date()
        SET q.current = true,
            q.theme = $theme,
            q.aiGenerated = coalesce(q.aiGenerated, false),
            q.updatedAt = datetime()
        RETURN q
      `;
      console.log('Found today\'s question, ensuring it\'s marked as current with theme:', todayTheme);
      result = await runQuery(updateQuery, { theme: todayTheme });
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



// Two-word themes, in order: Sunday (0) to Saturday (6)
const themes = [
  'reflection',           // Sunday
  'science_nature',       // Monday
  'history_politics',     // Tuesday
  'technology_innovation',// Wednesday
  'arts_culture',         // Thursday
  'society_ethics',       // Friday
  'sports'                // Saturday
];

function getTodayTheme() {
  // Compute day of week in Los Angeles timezone regardless of server locale
  const laNowString = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const laNow = new Date(laNowString);
  const day = laNow.getDay(); // 0 = Sunday, 1 = Monday, ...
  return themes[day];
}

function themeIdToNatural(themeId) {
  // Convert snake_case to natural phrase, e.g., "science_nature" -> "science and nature"
  // Simple rule: replace '_' with ' and ' for two-part ids; fallback to spaces otherwise
  if (!themeId) return '';
  const parts = themeId.split('_');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return themeId.replace(/_/g, ' ');
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
  try {
    const { headlines: providedHeadlines, theme, location } = req.body || {};
    const themeId = resolveThemeId(theme);
    const naturalTheme = themeIdToNatural(themeId);

    // Get headlines if not provided
    let headlines = normalizeProvidedHeadlines(providedHeadlines);
    if (!headlines || headlines.length === 0) {
      headlines = await fetchHeadlinesForTheme(naturalTheme, location, MAX_HEADLINES_FOR_QUESTION);
    }

    if (!headlines || headlines.length === 0) {
      return res.status(400).json({ error: 'No headlines available to generate a question' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    // Fallback if no API key: create a simple neutral question template
    if (!apiKey) {
      const firstTitle = headlines[0].title || 'today\'s news';
      const fallback = `Given recent headlines about ${naturalTheme}, including \"${firstTitle}\", do you think this topic deserves more public attention right now?`;
      return res.json({ themeId, naturalTheme, question: fallback, aiGenerated: false, headlines });
    }

    if (!fetch) {
      fetch = (await import('node-fetch')).default;
    }

    const prompt = `You are a helpful assistant that drafts a single, neutral, concise public discussion question (max 140 characters) relevant to current events that can be answered with agree or disagree. 
    The question should be based on the \n\nTheme: ${naturalTheme}\n and come from the Headlines:\n${headlines.map((h, i) => `- ${h.title}`).join('\n')}
    \n\n Guidelines:
    \n- out of the headlines, focus the question on the more unique headlines
    \n- make them actionable, example: "Ethical standards in media and technology are crucial for maintaining public trust in society." should instead be
    "Developing Ethical standards in media and technology are crucial for maintaining public trust in society."

    \n- Do not lead or assume facts; avoid yes/no phrasing like \"Do you support...\"
    \n- Avoid naming individuals unless essential
    \n- Be broadly applicable to a general audience
    \n- Output only the question text without quotes.
    \n- Make it specific enough so that each week will generate a unique question`;

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You generate one concise, neutral civic question from headlines answerable with "Agree or Disagree".' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 80
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI error:', errText);
      return res.status(502).json({ error: 'LLM call failed' });
    }

    const data = await resp.json();
    const question = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!question) {
      return res.status(502).json({ error: 'No question generated' });
    }

    const archiveQuery = `
      MATCH (q:Question {current: true})
      SET q.current = false,
          q.archivedAt = datetime()
      RETURN q
    `;
    await runQuery(archiveQuery);

    const sourcesJson = JSON.stringify(headlines.slice(0, MAX_HEADLINES_FOR_QUESTION));
    const createQuery = `
      MERGE (q:Question {text: $text})
      SET q.current = true,
          q.theme = $theme,
          q.aiGenerated = true,
          q.createdAt = datetime(),
          q.totalResponses = 0,
          q.agreeCount = 0,
          q.disagreeCount = 0,
          q.sourcesJson = $sourcesJson
      RETURN q
    `;
    await runQuery(createQuery, { text: question, theme: themeId, sourcesJson });

    return res.json({ themeId, naturalTheme, question, aiGenerated: true, headlines });
  } catch (e) {
    console.error('Error generating question:', e);
    return res.status(500).json({ error: 'Failed to generate question' });
  }
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

  // Final fallback: keep question generation functional even when external news sources fail.
  if (headlines.length === 0) {
    try {
      const questionsPath = path.join(__dirname, 'questions.json');
      const pool = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
      const fallbackThemeId = resolveThemeId(naturalTheme);
      const themedPool = pool.filter((q) => q && q.theme === fallbackThemeId && q.text);
      const sourcePool = themedPool.length > 0 ? themedPool : pool.filter((q) => q && q.text);

      for (const item of sourcePool) {
        const title = String(item.text).trim();
        if (!title || seen.has(title)) continue;

        headlines.push({
          title,
          source: 'questionhour-local-fallback',
          link: ''
        });
        seen.add(title);

        if (headlines.length >= limit) break;
      }
    } catch (fallbackError) {
      console.error('Local fallback headline generation failed:', fallbackError);
    }
  }

  return headlines.slice(0, limit);
}

async function generateQuestionFromHeadlines(headlines, naturalTheme) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const firstTitle = headlines[0]?.title || 'today\'s news';
    return {
      text: `Given recent headlines about ${naturalTheme}, including \"${firstTitle}\", what aspect deserves more public attention right now?`,
      aiGenerated: false
    };
  }
  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }
  const prompt = `You will generate ONE concise, neutral statement (<= 140 chars) for public discussion that people can AGREE or DISAGREE with.
    
Theme: ${naturalTheme}
Headlines:
${headlines.map((h, i) => `- ${h.title}`).join('\n')}

Guidelines:
- Output a single balanced statement (not a question).
- Do not assume unproven facts; keep it general.
- Avoid naming individuals unless essential.
- Output ONLY the statement, without quotes.`;
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You generate one concise, neutral civic question from headlines.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 80
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('LLM call failed');
  const data = await resp.json();
  const question = data?.choices?.[0]?.message?.content?.trim();
  if (!question) throw new Error('No question text');
  return {
    text: question,
    aiGenerated: true
  };
}

async function setQuestionOfTheDay() {
  // First check if we already have a question from today
  const todayQuery = `
    MATCH (q:Question)
    WHERE date(q.createdAt) = date() AND q.text IS NOT NULL
    RETURN q
    ORDER BY q.createdAt DESC
    LIMIT 1
  `;
  
  const theme = getTodayTheme();
  
  try {
    const existingQuestion = await runQuery(todayQuery);
    if (existingQuestion.length > 0) {
      console.log('Question for today already exists, using it');
      // Make sure it's marked as current and has the correct theme
      const updateQuery = `
        MATCH (q:Question)
        WHERE date(q.createdAt) = date()
        SET q.current = true,
            q.theme = $theme,
            q.aiGenerated = coalesce(q.aiGenerated, false),
            q.updatedAt = datetime()
        RETURN q
      `;
      const result = await runQuery(updateQuery, { theme });
      return result[0].get('q').properties;
    }
  } catch (e) {
    console.error('Error checking for existing question:', e);
  }

  // Archive any existing current question
  const archiveQuery = `
      MATCH (q:Question {current: true})
      SET q.current = false,
          q.archivedAt = datetime()
      RETURN q
    `;
  try {
    await runQuery(archiveQuery);
  } catch (e) {
    console.error('Error archiving current question during scheduler:', e);
  }

  // Sunday: Reflection day — set a reflection placeholder instead of a debate question
  if (theme === 'reflection') {
    const reflectionText = 'Reflection Day: Review this week\'s questions and your answers.';
    const createReflectionQuery = `
      MERGE (q:Question {text: $text})
      SET q.current = true,
          q.theme = $theme,
          q.aiGenerated = false,
          q.createdAt = datetime(),
          q.totalResponses = 0,
          q.agreeCount = 0,
          q.disagreeCount = 0
      RETURN q
    `;
    try {
      await runQuery(createReflectionQuery, { text: reflectionText, theme });
      return { text: reflectionText, theme };
    } catch (e) {
      console.error('Error creating reflection day placeholder:', e);
      return null;
    }
  }

  // Other days: try news-driven question first
  const questionsPath = path.join(__dirname, 'questions.json');
  let naturalTheme = themeIdToNatural(theme);
  try {
    const headlines = await fetchHeadlinesForTheme(naturalTheme);
    if (headlines && headlines.length > 0) {
      const generatedQuestion = await generateQuestionFromHeadlines(headlines, naturalTheme);
      const questionText = generatedQuestion?.text || '';
      const aiGenerated = Boolean(generatedQuestion?.aiGenerated);
      if (questionText && questionText.length > 0) {
        const sourcesJson = JSON.stringify(headlines.slice(0, MAX_HEADLINES_FOR_QUESTION));
        const createQuery = `
          MERGE (q:Question {text: $text})
          ON CREATE SET 
            q.createdAt = datetime(),
            // q.timestamp = datetime(),
            q.theme = $theme,
            q.aiGenerated = $aiGenerated,
            q.totalResponses = 0,
            q.agreeCount = 0,
            q.disagreeCount = 0
          SET
            q.current = true,
            q.aiGenerated = $aiGenerated,
            q.sourcesJson = $sourcesJson,
            q.updatedAt = datetime()
          RETURN q
        `;
        await runQuery(createQuery, { text: questionText, theme, sourcesJson, aiGenerated });
        return { text: questionText, theme };
      }
    }
  } catch (e) {
    console.error('News-driven generation failed, will fallback:', e.message || e);
  }

  // Fallback: pick a question from the local pool by theme
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  const filtered = questions.filter(q => q.theme === theme);
  if (filtered.length === 0) {
    console.log('No questions found for theme:', theme);
    return null;
  }
  const selected = filtered[Math.floor(Math.random() * filtered.length)];

  const naturalThemeFallback = themeIdToNatural(selected.theme);
  let headlines = [];
  try {
    headlines = await fetchHeadlinesForTheme(naturalThemeFallback);
  } catch (e) {
    console.warn('Could not fetch fallback headlines:', e.message || e);
  }
  const sourcesJson = JSON.stringify((headlines || []).slice(0, MAX_HEADLINES_FOR_QUESTION));

  const createQuery = `
    MERGE (q:Question {text: $text})
    SET q.current = true,
        q.theme = $theme,
        q.aiGenerated = false,
        q.createdAt = datetime(),
        q.totalResponses = 0,
        q.agreeCount = 0,
        q.disagreeCount = 0,
        q.sourcesJson = $sourcesJson
    RETURN q
  `;
  try {
    await runQuery(createQuery, { text: selected.text, theme: selected.theme, sourcesJson });
    return selected;
  } catch (e) {
    console.error('Error creating scheduled question of the day (fallback):', e);
    return null;
  }
}

// Run at midnight PST every day (00:00 PM America/Los_Angeles)
cron.schedule('0 0 * * *', setQuestionOfTheDay, {
  timezone: 'America/Los_Angeles'
});

// Also run once on server start to ensure there is a current item
setQuestionOfTheDay();

// Set new current question
app.post('/api/questions/current', async (req, res) => {
  console.log('POST /api/questions/current - Request received');
  console.log('Request body:', req.body);
  
  try {
    const { text, theme, aiGenerated } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Question text is required' });
    }
    
    // First, archive the current question if it exists
    const archiveQuery = `
      MATCH (q:Question {current: true})
      SET q.current = false,
          q.archivedAt = datetime()
      RETURN q
    `;
    console.log('Archiving current question');
    const archivedQuestion = await runQuery(archiveQuery);
    if (archivedQuestion.length > 0) {
      console.log('Archived question:', archivedQuestion[0].get('q').properties);
    }
    
    // Then create or update the new current question
    const createQuery = `
      MERGE (q:Question {text: $text})
      ON CREATE SET 
        q.createdAt = datetime(),
        // q.timestamp = datetime(),
        q.totalResponses = 0,
        q.agreeCount = 0,
        q.disagreeCount = 0
      SET 
        q.current = true,
        q.theme = $theme,
        q.aiGenerated = $aiGenerated,
        q.updatedAt = datetime()
      RETURN q
    `;
    
    console.log('Creating/updating new current question');
    const result = await runQuery(createQuery, { text, theme, aiGenerated: Boolean(aiGenerated) });
    console.log('Query result:', result);
    
    const questionData = result[0].get('q').properties;
    console.log('Returning question data:', questionData);
    res.json(questionData);
  } catch (error) {
    console.error('Error setting current question:', error);
    res.status(500).json({ error: 'Failed to set current question' });
  }
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
           collect(DISTINCT r.location) as locations
      RETURN q {
        .*,
        totalResponses: totalResponses,
        agreeCount: agreeCount,
        disagreeCount: disagreeCount,
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
  try {
    const deleteQuery = `
      MATCH (q:Question {current: true})
      DETACH DELETE q
    `;
    await runQuery(deleteQuery);
    return res.json({ ok: true, message: 'Current question deleted' });
  } catch (e) {
    console.error('Error deleting current question:', e);
    return res.status(500).json({ ok: false, error: e.message || 'failed' });
  }
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