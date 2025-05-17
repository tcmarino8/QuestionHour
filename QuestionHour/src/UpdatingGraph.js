import express from 'express';
import neo4j from 'neo4j-driver';

const app = express();
const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'password')
);

app.use(express.json());

// API to add a node separately
app.post('/add-node', async (req, res) => {
  const { id, name, color, target } = req.body;
  const session = driver.session();

  try {
    await session.run(
      `MERGE (n:Node {id: $id, name: $name, color: $color})`,
      { id, name, color }
    );

    if (target) {
      await session.run(
        `MATCH (a:Node {id: $id}), (b:Node {id: $target})
         MERGE (a)-[:CONNECTED_TO]->(b)`,
        { id, target }
      );
    }

    res.json({ message: 'Node added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add node' });
  } finally {
    await session.close();
  }
});

app.listen(5000, () => console.log('Server running on port 3000'));
