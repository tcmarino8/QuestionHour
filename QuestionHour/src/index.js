import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import* as neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'neo4j+s://ae4595f1.databases.neo4j.io',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'DczKuhO5LQwaSGM0cAiikTopEMpe4fB-Ah6kZCNqgL0',
  ),
  {}

)


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App driver = {driver}/>
  </React.StrictMode>
);


