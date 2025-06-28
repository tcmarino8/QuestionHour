// Utility functions for visualization
export const createGraphData = (question, responses) => {
  // Create question node with unique positioning
  const questionNode = { 
    id: `question-${question.text}`, 
    name: `Question: ${question.text}`, 
    color: "#8000FF",
    x: 0, 
    y: 0, 
    z: 0,
    theme: question.theme,
    type: 'question'
  };

  const nodes = [questionNode];
  const links = [];
  const points = [];
  const zipStats = {};
  let mostActiveZip = { zip: '', count: 0 };
  let agreeCount = 0;
  let disagreeCount = 0;

  // Separate responses into agree and disagree
  const agreeResponses = responses.filter(r => r.response === 'agree');
  const disagreeResponses = responses.filter(r => r.response === 'disagree');

  // Constants for radius calculation
  const BASE_RADIUS = 50;  // Minimum distance from question
  const RADIUS_INCREMENT = 30;  // How much to increase radius per response
  const MAX_RADIUS = 300;  // Maximum distance from question

  // Process agree responses (0-180 degrees)
  agreeResponses.forEach((response, index) => {
    agreeCount++;
    const nodeId = `response-${question.text}-agree-${index}`;
    // Calculate angle between 0 and 180 degrees
    const angle = (index / Math.max(agreeResponses.length, 1)) * Math.PI;
    // Calculate radius based on index
    const radius = Math.min(
      BASE_RADIUS + (index * RADIUS_INCREMENT),
      MAX_RADIUS
    );
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = (Math.random() - 0.5) * 50;

    nodes.push({
      id: nodeId,
      name: `ZIP: ${response.location}`,
      color: 'green',
      x,
      y,
      z,
      type: 'response',
      response: 'agree',
      timestamp: response.timestamp,
      radius: radius // Store radius for debugging
    });

    links.push({
      source: questionNode.id,
      target: nodeId,
      color: 'green',
      width: 4,
      type: 'response'
    });

    // Update ZIP stats
    updateZipStats(response, zipStats);
  });

  // Process disagree responses (181-359 degrees)
  disagreeResponses.forEach((response, index) => {
    disagreeCount++;
    const nodeId = `response-${question.text}-disagree-${index}`;
    // Calculate angle between 181 and 359 degrees (PI to 2PI)
    const angle = Math.PI + (index / Math.max(disagreeResponses.length, 1)) * Math.PI;
    // Calculate radius based on index
    const radius = Math.min(
      BASE_RADIUS + (index * RADIUS_INCREMENT),
      MAX_RADIUS
    );
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = (Math.random() - 0.5) * 50;

    nodes.push({
      id: nodeId,
      name: `ZIP: ${response.location}`,
      color: 'red',
      x,
      y,
      z,
      type: 'response',
      response: 'disagree',
      timestamp: response.timestamp,
      radius: radius // Store radius for debugging
    });

    links.push({
      source: questionNode.id,
      target: nodeId,
      color: 'red',
      width: 4,
      type: 'response'
    });

    // Update ZIP stats
    updateZipStats(response, zipStats);
  });

  // Update most active ZIP
  Object.entries(zipStats).forEach(([zip, stats]) => {
    if (stats.total > mostActiveZip.count) {
      mostActiveZip = {
        zip,
        count: stats.total
      };
    }
  });

  // Create map points with statistics
  Object.entries(zipStats).forEach(([zip, stats]) => {
    points.push({
      id: `zip-${zip}`,
      lat: addCoordinateJitter(stats.lat),
      lng: addCoordinateJitter(stats.lng),
      color: stats.agree >= stats.disagree ? 'green' : 'red',
      stats: {
        agree: stats.agree,
        disagree: stats.disagree,
        total: stats.total
      }
    });
  });

  return {
    graphData: { nodes, links },
    mapPoints: points,
    stats: {
      totalResponses: responses.length,
      agreeCount,
      disagreeCount,
      mostActiveZip
    }
  };
};

// Helper function to update ZIP code statistics
const updateZipStats = (response, zipStats) => {
  if (!zipStats[response.location]) {
    zipStats[response.location] = {
      agree: 0,
      disagree: 0,
      lat: response.lat,
      lng: response.lng,
      total: 0
    };
  }
  if (response.response === 'agree') {
    zipStats[response.location].agree++;
  } else {
    zipStats[response.location].disagree++;
  }
  zipStats[response.location].total++;
};

// Function to add random jitter to coordinates
export const addCoordinateJitter = (coord, maxJitter = 0.01) => {
  const jitter = (Math.random() - 0.5) * maxJitter;
  return coord + jitter;
}; 