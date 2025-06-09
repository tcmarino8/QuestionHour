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
    // console.log('Received POST request with body:', req.body);
    
    // Validate request body
    validateResponseBody(req.body);
    
    const { question, response, timestamp, location, lat, lng } = req.body;
    
    // First, ensure the question exists
    const questionQuery = `
      MERGE (q:Question {text: $question})
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
    // console.log('Sending response data:', responseData);
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

// Routes
app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 