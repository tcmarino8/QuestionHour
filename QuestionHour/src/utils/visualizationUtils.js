

// Utility functions for visualization

export const LAVENDER_COLOR = '#B57EDC';

// Function to add random jitter to coordinates
export const addCoordinateJitter = (coord, maxJitter = 0.01) => {
  const jitter = (Math.random() - 0.5) * maxJitter;
  return coord + jitter;
}; 

export const createGraphData = (question, responses) => {
  const isReflectionTheme = (question?.theme || '').toLowerCase() === 'reflection';

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
  let mostDividedZip = { zip: '', percentAgree: 0, percentDisagree: 0, diff: 1 };
  let maxAgreeZip = { zip: '', percentAgree: 0 };
  let maxDisagreeZip = { zip: '', percentDisagree: 0 };
  let agreeCount = 0;
  let disagreeCount = 0;
  let reflectedCount = 0;

  // Separate responses by type
  const agreeResponses = responses.filter(r => r.response === 'agree');
  const disagreeResponses = responses.filter(r => r.response === 'disagree');
  const reflectedResponses = responses.filter(r => r.response === 'reflected');

  // Constants for radius calculation
  const BASE_RADIUS = 50;  // Minimum distance from question
  const RADIUS_INCREMENT = 30;  // How much to increase radius per response
  const MAX_RADIUS = 300;  // Maximum distance from question

    // Helper function to update ZIP code statistics
  const updateZipStats = (response, zipStats) => {
    if (!zipStats[response.location]) {
      zipStats[response.location] = {
        agree: 0,
        disagree: 0,
        reflected: 0,
        lat: response.lat,
        lng: response.lng,
        total: 0
      };
    }
    if (response.response === 'agree') {
      zipStats[response.location].agree++;
    } else if (response.response === 'disagree') {
      zipStats[response.location].disagree++;
    } else if (response.response === 'reflected') {
      zipStats[response.location].reflected++;
    }
    zipStats[response.location].total++;
  };

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
      color: isReflectionTheme ? LAVENDER_COLOR : 'green',
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
      color: isReflectionTheme ? LAVENDER_COLOR : 'green',
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
      color: isReflectionTheme ? LAVENDER_COLOR : 'red',
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
      color: isReflectionTheme ? LAVENDER_COLOR : 'red',
      width: 4,
      type: 'response'
    });

    // Update ZIP stats
    updateZipStats(response, zipStats);
  });

  // Process reflected responses around full circle
  reflectedResponses.forEach((response, index) => {
    reflectedCount++;
    const nodeId = `response-${question.text}-reflected-${index}`;
    const angle = (index / Math.max(reflectedResponses.length, 1)) * Math.PI * 2;
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
      color: LAVENDER_COLOR,
      x,
      y,
      z,
      type: 'response',
      response: 'reflected',
      timestamp: response.timestamp,
      radius: radius
    });

    links.push({
      source: questionNode.id,
      target: nodeId,
      color: LAVENDER_COLOR,
      width: 4,
      type: 'response'
    });

    updateZipStats(response, zipStats);
  });



  Object.entries(zipStats).forEach(([zip, stats]) => {
    // Most active ZIP
    if (stats.total > mostActiveZip.count) {
      mostActiveZip = { zip, count: stats.total };
    }

    // Most divided, most agree, most disagree
    const totalPolarized = stats.agree + stats.disagree;
    if (totalPolarized > 0) {
      const percentAgree = stats.agree / totalPolarized;
      const percentDisagree = stats.disagree / totalPolarized;
      const diff = Math.abs(percentAgree - 0.5);

      if (diff < mostDividedZip.diff) {
        mostDividedZip = { zip, percentAgree, percentDisagree, diff };
      }
      if (percentAgree > maxAgreeZip.percentAgree) {
        maxAgreeZip = { zip, percentAgree };
      }
      if (percentDisagree > maxDisagreeZip.percentDisagree) {
        maxDisagreeZip = { zip, percentDisagree };
      }
    }

    // Create map point
    points.push({
      id: `zip-${zip}`,
      lat: addCoordinateJitter(stats.lat),
      lng: addCoordinateJitter(stats.lng),
      color: isReflectionTheme ? LAVENDER_COLOR : (stats.agree >= stats.disagree ? 'green' : 'red'),
      stats: {
        agree: stats.agree,
        disagree: stats.disagree,
        reflected: stats.reflected,
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
      reflectedCount,
      mostActiveZip,
      mostDividedZip,
      maxAgreeZip,
      maxDisagreeZip
    }
  };
};