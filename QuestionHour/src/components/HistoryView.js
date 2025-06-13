import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function HistoryView({ onClose }) {
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [graphData, setGraphData] = useState({
    nodes: [{ id: 'question', name: 'Select a question', color: "#4CAF50", x: 0, y: 0, z: 0 }],
    links: []
  });
  const [mapPoints, setMapPoints] = useState([]);
  const [error, setError] = useState('');
  const [responseStats, setResponseStats] = useState({
    totalResponses: 0,
    agreeCount: 0,
    disagreeCount: 0,
    mostActiveZip: { zip: '', count: 0 }
  });

  // Function to add random jitter to coordinates
  const addCoordinateJitter = (coord, maxJitter = 0.01) => {
    const jitter = (Math.random() - 0.5) * maxJitter;
    return coord + jitter;
  };

  // Fetch question history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await api.getQuestionHistory();
        setQuestions(history);
        // Set the most recent question as default
        if (history.length > 0) {
          const mostRecent = history.reduce((latest, current) => 
            new Date(current.archivedAt) > new Date(latest.archivedAt) ? current : latest
          );
          setSelectedQuestion(mostRecent);
          updateVisualization(mostRecent);
        }
      } catch (error) {
        console.error('Error fetching question history:', error);
        setError('Failed to fetch question history');
      }
    };
    fetchHistory();
  }, []);

  // Update visualization when a question is selected
  const updateVisualization = async (question) => {
    if (!question) return;

    try {
      const responses = await api.getQuestionResponses(question.text);
      
      // Convert responses to graph data
      const nodes = [
        { 
          id: 'question', 
          name: `Question: ${question.text}`, 
          color: "#4CAF50", 
          x: 0, 
          y: 0, 
          z: 0
        }
      ];
      const links = [];
      const points = [];

      // Group responses by ZIP code for map statistics
      const zipStats = {};
      let agreeCount = 0;
      let disagreeCount = 0;
      let mostActiveZip = { zip: '', count: 0 };

      responses.locations.forEach(location => {
        const response = responses.responses.find(r => r.location === location);
        if (!response) return;

        // Count agree/disagree
        if (response.response === 'agree') {
          agreeCount++;
        } else {
          disagreeCount++;
        }

        // Track ZIP code statistics
        if (!zipStats[location]) {
          zipStats[location] = {
            agree: 0,
            disagree: 0,
            lat: response.lat,
            lng: response.lng,
            total: 0
          };
        }
        if (response.response === 'agree') {
          zipStats[location].agree++;
        } else {
          zipStats[location].disagree++;
        }
        zipStats[location].total++;

        // Update most active ZIP
        if (zipStats[location].total > mostActiveZip.count) {
          mostActiveZip = {
            zip: location,
            count: zipStats[location].total
          };
        }
      });

      // Update response statistics
      setResponseStats({
        totalResponses: responses.totalResponses,
        agreeCount: responses.agreeCount,
        disagreeCount: responses.disagreeCount,
        mostActiveZip
      });

      // Create nodes and links
      responses.responses.forEach((response, index) => {
        const nodeId = `response-${index}`;
        const angle = Math.random() * Math.PI * 2;
        const radius = 100;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const z = (Math.random() - 0.5) * 50;

        const node = {
          id: nodeId,
          name: `ZIP: ${response.location}`,
          color: response.response === 'agree' ? 'green' : 'red',
          x,
          y,
          z
        };
        nodes.push(node);

        const link = {
          source: 'question',
          target: nodeId,
          color: response.response === 'agree' ? 'green' : 'red',
          width: 4
        };
        links.push(link);
      });

      // Create map points with statistics and jittered coordinates
      Object.entries(zipStats).forEach(([zip, stats]) => {
        const point = {
          id: `zip-${zip}`,
          lat: addCoordinateJitter(stats.lat),
          lng: addCoordinateJitter(stats.lng),
          color: stats.agree >= stats.disagree ? 'green' : 'red',
          stats: {
            agree: stats.agree,
            disagree: stats.disagree,
            total: stats.total
          }
        };
        points.push(point);
      });

      setGraphData({ nodes, links });
      setMapPoints(points);
    } catch (error) {
      console.error('Error updating visualization:', error);
      setError('Failed to update visualization');
    }
  };

  // Handle question selection
  const handleQuestionChange = (event) => {
    const selectedQuestionText = event.target.value;
    const question = questions.find(q => q.text === selectedQuestionText);
    if (question) {
      setSelectedQuestion(question);
      updateVisualization(question);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 2000,
      overflow: 'auto',
      padding: '20px'
    }}>
      <div style={{
        position: 'relative',
        maxWidth: '1200px',
        margin: '0 auto',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0 }}>Question History</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <select
              value={selectedQuestion?.text || ''}
              onChange={handleQuestionChange}
              style={{
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                minWidth: '300px',
                fontSize: '14px'
              }}
            >
              <option value="">Select a question</option>
              {questions.map((question, index) => (
                <option key={index} value={question.text}>
                  {new Date(question.archivedAt).toLocaleString()} - {question.text}
                </option>
              ))}
            </select>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>

        {selectedQuestion && (
          <>
            {/* Question and Stats Panel */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '20px',
              gap: '20px'
            }}>
              <div style={{
                flex: 1,
                padding: '20px',
                background: '#f9f9f9',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                fontSize: '1.4rem',
                fontWeight: 'bold',
                textAlign: 'center',
                color: '#333'
              }}>
                {selectedQuestion.text}
              </div>
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '15px',
                borderRadius: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                minWidth: '200px'
              }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>Response Statistics</h3>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ color: 'green', fontWeight: 'bold' }}>Agree: {responseStats.agreeCount}</div>
                  <div style={{ color: 'red', fontWeight: 'bold' }}>Disagree: {responseStats.disagreeCount}</div>
                  <div style={{ marginTop: '5px' }}>Total: {responseStats.totalResponses}</div>
                </div>
                {responseStats.mostActiveZip.zip && (
                  <div style={{ 
                    marginTop: '10px', 
                    paddingTop: '10px', 
                    borderTop: '1px solid #eee',
                    fontSize: '0.9rem'
                  }}>
                    <div style={{ fontWeight: 'bold' }}>Most Active ZIP:</div>
                    <div>{responseStats.mostActiveZip.zip}</div>
                    <div style={{ color: '#666' }}>{responseStats.mostActiveZip.count} responses</div>
                  </div>
                )}
              </div>
            </div>

            {/* Visualizations */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
              height: 'calc(100vh - 300px)'
            }}>
              <div style={{ height: '100%' }}>
                <ForceGraph3D
                  graphData={graphData}
                  nodeAutoColorBy="color"
                  nodeLabel="name"
                  linkColor='color'
                  linkWidth={4}
                  linkDirectionalParticles={2}
                  linkDirectionalParticleWidth={2}
                  enableNodeDrag={true}
                  enableNavigationControls={true}
                  enablePointerInteraction={true}
                  cooldownTicks={100}
                />
              </div>
              <div style={{ height: '100%' }}>
                <MapContainer
                  center={[37.0902, -95.7129]}
                  zoom={4}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  {mapPoints.map(point => (
                    <CircleMarker
                      key={point.id}
                      center={[point.lat, point.lng]}
                      radius={Math.min(5 + point.stats.total, 30)}
                      fillColor={point.color}
                      color="#fff"
                      weight={1}
                      fillOpacity={0.7}
                    >
                      <Popup>
                        <div style={{
                          padding: '10px',
                          textAlign: 'center'
                        }}>
                          <h3 style={{ margin: '0 0 10px 0' }}>ZIP Code: {point.id.replace('zip-', '')}</h3>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'green' }}>Agree: {point.stats.agree}</span>
                            <span style={{ color: 'red' }}>Disagree: {point.stats.disagree}</span>
                          </div>
                          <p style={{ margin: '10px 0 0 0' }}>Total Votes: {point.stats.total}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </>
        )}

        {error && <p className="error" style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
      </div>
    </div>
  );
}

export default HistoryView; 