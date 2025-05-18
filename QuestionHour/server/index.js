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
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

// Helper function to run Neo4j queries
async function runQuery(query, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

// Get all responses
app.get('/responses', async (req, res) => {
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
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

// Add a new response
app.post('/responses', async (req, res) => {
  try {
    const { question, response, timestamp, location, lat, lng } = req.body;
    
    const query = `
      MERGE (q:Question {text: $question})
      CREATE (r:Response {
        response: $response,
        timestamp: $timestamp,
        location: $location,
        lat: $lat,
        lng: $lng
      })
      CREATE (q)-[:HAS_RESPONSE]->(r)
      
      // Create connections between responses from the same ZIP code
      WITH r
      MATCH (other:Response {location: $location})
      WHERE other <> r
      CREATE (r)-[:SAME_ZIP]->(other)
      
      RETURN r
    `;
    
    const result = await runQuery(query, {
      question,
      response,
      timestamp,
      location,
      lat,
      lng
    });
    
    res.json(result[0].get('r').properties);
  } catch (error) {
    console.error('Error adding response:', error);
    res.status(500).json({ error: 'Failed to add response' });
  }
});

// Reset all data
app.delete('/responses', async (req, res) => {
  try {
    const query = `
      MATCH (q:Question)
      OPTIONAL MATCH (q)-[:HAS_RESPONSE]->(r:Response)
      OPTIONAL MATCH (r)-[rel:SAME_ZIP]->()
      DELETE rel
      DELETE r
      DELETE q
    `;
    await runQuery(query);
    res.json({ message: 'All data reset successfully' });
  } catch (error) {
    console.error('Error resetting data:', error);
    res.status(500).json({ error: 'Failed to reset data' });
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