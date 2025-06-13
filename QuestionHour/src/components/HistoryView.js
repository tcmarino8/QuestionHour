import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createGraphData } from '../utils/visualizationUtils';

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

  // Update visualization when a question is selected
  const updateVisualization = React.useCallback(async (question) => {
    if (!question) return;

    try {
      const { graphData: newGraphData, mapPoints: newMapPoints, stats } = createGraphData(question, question.responses);
      
      setGraphData(newGraphData);
      setMapPoints(newMapPoints);
      setResponseStats(stats);
    } catch (error) {
      console.error('Error updating visualization:', error);
      setError('Failed to update visualization');
    }
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await api.getQuestionHistory();
        console.log('Raw question history from Neo4j:', JSON.stringify(history, null, 2));
        
        // Log each question's timestamp before sorting
        console.log('Questions before sorting:');
        history.forEach((q, index) => {
          console.log(`Question ${index + 1}:`, {
            text: q.text,
            timestamp: q.timestamp,
            parsedDate: new Date(q.timestamp)
          });
        });
        
        // Sort questions by timestamp in descending order
        const sortedQuestions = history.sort((a, b) => {
          const dateA = new Date(a.timestamp);
          const dateB = new Date(b.timestamp);
          console.log('Comparing dates:', {
            a: { text: a.text, timestamp: a.timestamp, parsed: dateA },
            b: { text: b.text, timestamp: b.timestamp, parsed: dateB }
          });
          return dateB - dateA;
        });
        
        // Log the sorted order
        console.log('Questions after sorting:');
        sortedQuestions.forEach((q, index) => {
          console.log(`Question ${index + 1}:`, {
            text: q.text,
            timestamp: q.timestamp,
            parsedDate: new Date(q.timestamp)
          });
        });
        
        setQuestions(sortedQuestions);
        
        // Set the most recent question as default
        if (sortedQuestions.length > 0) {
          console.log('Setting most recent question:', sortedQuestions[0]);
          setSelectedQuestion(sortedQuestions[0]);
          updateVisualization(sortedQuestions[0]);
        } else {
          console.log('No archived questions found in Neo4j');
        }
      } catch (error) {
        console.error('Error fetching question history:', error);
        setError('Failed to fetch question history');
      }
    };
    fetchHistory();
  }, [updateVisualization]);

  // Handle question selection
  const handleQuestionChange = (event) => {
    const selectedQuestionText = event.target.value;
    console.log('Selected question text:', selectedQuestionText);
    const question = questions.find(q => q.text === selectedQuestionText);
    console.log('Found question:', question);
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
      zIndex: 2000
    }}>
      {/* Top left dropdown */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 2001,
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <select
          value={selectedQuestion?.text || ''}
          onChange={handleQuestionChange}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            minWidth: '300px',
            fontSize: '14px',
            backgroundColor: 'white'
          }}
        >
          <option value="">Select a question</option>
          {questions.map((question, index) => {
            const date = new Date(question.timestamp);
            console.log('Rendering question:', {
              text: question.text,
              timestamp: question.timestamp,
              parsedDate: date
            });
            return (
              <option key={index} value={question.text}>
                {date instanceof Date && !isNaN(date) 
                  ? date.toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })
                  : 'Invalid Date'} - {question?.text}
              </option>
            );
          })}
        </select>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Close
        </button>
      </div>

      {/* Stats Panel */}
      {selectedQuestion && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 2001,
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
      )}

      {/* Visualizations */}
      {selectedQuestion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
          padding: '20px'
        }}>
          <div style={{ height: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden' }}>
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
          <div style={{ height: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden' }}>
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
      )}

      {error && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          zIndex: 2002
        }}>
          <p style={{ color: 'red', margin: 0 }}>{error}</p>
        </div>
      )}
    </div>
  );
}

export default HistoryView; 