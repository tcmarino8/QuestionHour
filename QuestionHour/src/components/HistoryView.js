import React, { useState, useEffect, useCallback } from 'react';
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

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleResponses, setVisibleResponses] = useState([]);

  // Update visualization with visible responses only
  const updateVisibleVisualization = useCallback((question, responses) => {
    if (!question) return;
    try {
      const { graphData: newGraphData, mapPoints: newMapPoints, stats } = createGraphData(question, responses);
      setGraphData(newGraphData);
      setMapPoints(newMapPoints);
      setResponseStats(stats);
    } catch (error) {
      console.error('Error updating visualization:', error);
      setError('Failed to update visualization');
    }
  }, []);

  // Handle playback
  useEffect(() => {
    if (!isPlaying || !selectedQuestion || !selectedQuestion.responses) return;

    const responses = selectedQuestion.responses;
    if (responses.length === 0) return;

    const intervalTime = 500 / playbackSpeed; // Base interval of 500ms adjusted by speed
    const interval = setInterval(() => {
      setCurrentIndex(prevIndex => {
        if (prevIndex >= responses.length) {
          setIsPlaying(false);
          return prevIndex;
        }

        const newResponses = responses.slice(0, prevIndex + 1);
        setVisibleResponses(newResponses);
        updateVisibleVisualization(selectedQuestion, newResponses);
        
        return prevIndex + 1;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isPlaying, selectedQuestion, playbackSpeed, updateVisibleVisualization]);

  // Reset playback when question changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setVisibleResponses([]);
    if (selectedQuestion && selectedQuestion.responses) {
      updateVisibleVisualization(selectedQuestion, []);
    }
  }, [selectedQuestion, updateVisibleVisualization]);

  // Original fetch history effect...
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await api.getQuestionHistory();
        const sortedQuestions = history.sort((a, b) => {
          const dateA = new Date(a.timestamp);
          const dateB = new Date(b.timestamp);
          return dateB - dateA;
        });
        
        setQuestions(sortedQuestions);
        
        if (sortedQuestions.length > 0) {
          setSelectedQuestion(sortedQuestions[0]);
          updateVisibleVisualization(sortedQuestions[0], []);
        }
      } catch (error) {
        console.error('Error fetching question history:', error);
        setError('Failed to fetch question history');
      }
    };
    fetchHistory();
  }, [updateVisibleVisualization]);

  // Handle question selection
  const handleQuestionChange = (event) => {
    const selectedQuestionText = event.target.value;
    const question = questions.find(q => q.text === selectedQuestionText);
    if (question) {
      setSelectedQuestion(question);
      setIsPlaying(false);
      setCurrentIndex(0);
      setVisibleResponses([]);
      updateVisibleVisualization(question, []);
    }
  };

  // Start playback from beginning
  const handlePlay = () => {
    if (!selectedQuestion || !selectedQuestion.responses) return;
    
    if (currentIndex >= selectedQuestion.responses.length) {
      // If at the end, restart from beginning
      setCurrentIndex(0);
      setVisibleResponses([]);
      updateVisibleVisualization(selectedQuestion, []);
    }
    
    setIsPlaying(true);
  };

  // Playback controls component
  const PlaybackControls = () => (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2001,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      padding: '10px',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      gap: '10px',
      alignItems: 'center'
    }}>
      <button
        onClick={() => isPlaying ? setIsPlaying(false) : handlePlay()}
        style={{
          padding: '8px 16px',
          background: isPlaying ? '#f44336' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {isPlaying ? 'Pause' : currentIndex >= (selectedQuestion?.responses?.length || 0) ? 'Replay' : 'Play'}
      </button>
      <select
        value={playbackSpeed}
        onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
        style={{
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #ccc'
        }}
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
      </select>
      <div style={{ color: '#666' }}>
        Responses: {visibleResponses.length} / {selectedQuestion?.responses?.length || 0}
      </div>
    </div>
  );

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

      {/* Add playback controls */}
      {selectedQuestion && <PlaybackControls />}

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