require('dotenv').config();
const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Add a new response
app.post('/api/responses', async (req, res) => {
  try {
    const { question, response, timestamp, location, lat, lng } = req.body;
    
    // First, ensure the question exists with its properties
    const questionQuery = `
      MERGE (q:Question {text: $question})
      SET q.current = true,
          q.timestamp = datetime()
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
  try {
    const query = `
      MATCH (q:Question {current: true})
      RETURN q
    `;
    
    console.log('Executing query to find current question');
    const result = await runQuery(query);
    console.log('Query result:', result);
    
    if (result.length === 0) {
      console.log('No current question found');
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

// Set new current question
app.post('/api/questions/current', async (req, res) => {
  console.log('POST /api/questions/current - Request received');
  console.log('Request body:', req.body);
  
  try {
    const { text, theme } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Question text is required' });
    }
    
    // First, archive the current question if it exists
    const archiveQuery = `
      MATCH (q:Question {current: true})
      WITH q
      OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
      WITH q, 
           count(r) as totalResponses,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'agree'}) | r]) as agreeCount,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'disagree'}) | r]) as disagreeCount
      SET q.current = false,
          q.archivedAt = datetime(),
          q.totalResponses = totalResponses,
          q.agreeCount = agreeCount,
          q.disagreeCount = disagreeCount
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
      SET q.current = true,
          q.theme = $theme,
          q.timestamp = datetime(),
          q.totalResponses = 0,
          q.agreeCount = 0,
          q.disagreeCount = 0
      RETURN q
    `;
    
    console.log('Creating/updating new current question');
    const result = await runQuery(createQuery, { text, theme });
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
      WHERE q.archivedAt IS NOT NULL
      WITH q
      OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
      WITH q, 
           collect(r) as responses,
           count(r) as totalResponses,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'agree'}) | r]) as agreeCount,
           size([(q)-[:HAS_RESPONSE]->(r:Response {response: 'disagree'}) | r]) as disagreeCount,
           collect(DISTINCT r.location) as locations
      RETURN q {
        .*,
        timestamp: toString(q.archivedAt),
        responses: [r in responses | r {
          .*,
          location: r.location,
          lat: r.lat,
          lng: r.lng,
          response: r.response,
          timestamp: toString(r.timestamp)
        }],
        totalResponses: totalResponses,
        agreeCount: agreeCount,
        disagreeCount: disagreeCount,
        uniqueLocations: size(locations)
      }
      ORDER BY q.archivedAt DESC
    `;
    
    console.log('Fetching question history with responses from Neo4j');
    const result = await runQuery(query);
    console.log('Found', result.length, 'archived questions with responses');
    
    const history = result.map(record => record.get('q'));
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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Catch-all route - MUST BE LAST
app.get('/', (req, res) => {
  res.send('Server is running');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 