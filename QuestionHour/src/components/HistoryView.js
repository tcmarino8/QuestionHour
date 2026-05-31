import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createGraphData, LAVENDER_COLOR } from '../utils/visualizationUtils';
import {MAP_STYLES, THEME_TO_MAP_STYLE} from '../App';
import CardDeckSlider from './CardDeckSlider';

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
    reflectedCount: 0,
    mostActiveZip: { zip: '', count: 0 },
    mostDividedZip: { zip: '', percentAgree: 0, percentDisagree: 0, diff: 1 },
    maxAgreeZip : { zip: '', percentAgree: 0 },
    maxDisagreeZip:{ zip: '', percentDisagree: 0 }
  });

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleResponses, setVisibleResponses] = useState([]);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const isMobile = viewportWidth <= 900;
  const isSmallMobile = viewportWidth <= 480;
  const isReflectionTheme = (selectedQuestion?.theme || '').toLowerCase() === 'reflection';
  const historyMapRef = useRef(null);

  const metadataDate = selectedQuestion?.createdAt
    ? new Date(selectedQuestion.createdAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      })
    : '';
  const historyMetaLabel = selectedQuestion
    ? `${metadataDate} · ${(selectedQuestion.theme || 'general').replace(/_/g, ' ')}`
    : '';

  const handleHistoryCardChange = useCallback((index) => {
    if (index === 0 && historyMapRef.current) {
      setTimeout(() => historyMapRef.current.invalidateSize(), 120);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

    // Determine map style based on selected question's theme
  const mapStyle = React.useMemo(() => {
    if (!selectedQuestion) return 'stamen_toner'; // fallback
    const theme = (selectedQuestion.theme || 'general').toLowerCase();
    return THEME_TO_MAP_STYLE[theme] || 'stamen_toner';
  }, [selectedQuestion]);


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
          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
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
    bottom: isMobile ? '10px' : '20px',
    left: isMobile ? '10px' : '20px',
    transform: 'none', // Remove centering
    zIndex: 2001,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: isSmallMobile ? '10px' : '14px',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: isMobile ? 'calc(100vw - 20px)' : 'none'
  }}>
      <button
        onClick={() => isPlaying ? setIsPlaying(false) : handlePlay()}
        style={{
          padding: isSmallMobile ? '10px 16px' : '12px 22px',
          background: isPlaying ? '#f44336' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: isSmallMobile ? '1rem' : '1.1rem',
          fontWeight: 700
        }}
      >
        {isPlaying ? 'Pause' : currentIndex >= (selectedQuestion?.responses?.length || 0) ? 'Replay' : 'Play'}
      </button>
      <select
        value={playbackSpeed}
        onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
        style={{
          padding: isSmallMobile ? '10px' : '11px 12px',
          borderRadius: '8px',
          border: '1px solid #ccc',
          fontSize: isSmallMobile ? '1rem' : '1.05rem',
          fontWeight: 600
        }}
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
      </select>
      <div style={{ color: '#555', fontSize: isSmallMobile ? '1rem' : '1.1rem', fontWeight: 600 }}>
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
        top: isMobile ? '10px' : '20px',
        left: isMobile ? '10px' : '20px',
        zIndex: 2001,
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        maxWidth: isMobile ? 'calc(100vw - 20px)' : 'none'
      }}>
        <select
          value={selectedQuestion?.text || ''}
          onChange={handleQuestionChange}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            minWidth: isMobile ? '0' : '300px',
            width: isMobile ? 'calc(100vw - 120px)' : 'auto',
            fontSize: '14px',
            backgroundColor: 'white'
          }}
        >
          <option value="">Select a question</option>
          {questions.map((question, index) => {
            const date = new Date(question.createdAt);
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

       <div style={{
        position: 'fixed',
        top: isMobile ? '10px' : '20px',
        right: isMobile ? '10px' : '20px',
        zIndex: 1000
      }}>
        <button
          onClick={() => setShowStatsPanel(!showStatsPanel)}
          style={{
            padding: '10px 20px',
            background: showStatsPanel ? '#666' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.3s ease'
          }}
        >
          <span>{showStatsPanel ? 'Hide Stats' : 'Show Stats'}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d={showStatsPanel ? "M10 6L2 6" : "M2 6L10 6"} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={showStatsPanel ? "M6 2L6 10" : "M6 2L6 10"} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Bottom Stats Panel */}
      <div style={{
        position: 'fixed',
        bottom: showStatsPanel ? '20px' : '-120px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100vw - 20px)',
        maxWidth: '1200px',
        minWidth: '0',
        boxSizing: 'border-box',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        boxShadow: '0 0 30px rgba(0, 0, 0, 0.3)',
        zIndex: 999,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: isMobile ? '12px 16px' : '15px 30px',
        borderRadius: isMobile ? '14px' : '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: isMobile ? 'flex-start' : 'space-between',
        alignItems: 'center',
        gap: isMobile ? '16px' : '30px',
        overflowX: isMobile ? 'auto' : 'visible'
      }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', whiteSpace: 'nowrap' }}>Live Stats</h3>
            <div style={{ 
              display: 'flex',
              gap: '20px',
              alignItems: 'center',
              borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
              paddingLeft: '20px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: isReflectionTheme ? LAVENDER_COLOR : '#4CAF50', fontSize: '1.4rem', fontWeight: 'bold' }}>
                  {isReflectionTheme ? responseStats.reflectedCount : responseStats.agreeCount}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
                  {isReflectionTheme ? 'Reflected' : 'Agree'}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#f44336', fontSize: '1.4rem', fontWeight: 'bold' }}>{responseStats.disagreeCount}</div>
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>Disagree</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#2196F3', fontSize: '1.4rem', fontWeight: 'bold' }}>{responseStats.totalResponses}</div>
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>Total</div>
              </div>
            </div>
          </div>
          {responseStats.mostActiveZip.zip && (
            <div style={{ 
              borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
              paddingLeft: '20px'
            }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>Most Active ZIP</div>
              <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{responseStats.mostActiveZip.zip}</div>
              <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.8rem' }}>{responseStats.mostActiveZip.count} responses</div>
            </div>
          )}
           {!isReflectionTheme && responseStats.mostDividedZip.zip && (
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '20px' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Most Divided ZIP</div>
              <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{responseStats.mostDividedZip.zip}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                {Math.round(responseStats.mostDividedZip.percentAgree * 100)}% Agree / {Math.round(responseStats.mostDividedZip.percentDisagree * 100)}% Disagree
              </div>
            </div>
          )}
          {!isReflectionTheme && responseStats.maxAgreeZip.zip && (
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '20px' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Most Agree ZIP</div>
              <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{responseStats.maxAgreeZip.zip}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                {Math.round(responseStats.maxAgreeZip.percentAgree * 100)}% Agree
              </div>
            </div>
          )}
          {!isReflectionTheme && responseStats.maxDisagreeZip.zip && (
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '20px' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Most Disagree ZIP</div>
              <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{responseStats.maxDisagreeZip.zip}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                {Math.round(responseStats.maxDisagreeZip.percentDisagree * 100)}% Disagree
              </div>
            </div>
          )}
          
          <button
            onClick={() => setShowStatsPanel(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '18px',
              padding: 0,
              transition: 'all 0.2s ease',
              ':hover': {
                background: 'rgba(255, 255, 255, 0.2)'
              }
            }}
          >
            ×
          </button>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        margin: '20px 0',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 900
      }}></div>
      {/* {selectedQuestion && (
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
      )} */}

      {/* Visualizations */}
      {selectedQuestion && (
        <div style={{
          position: 'fixed',
          top: isMobile ? 62 : 72,
          left: 0,
          right: 0,
          bottom: isMobile ? 72 : 78,
          padding: isMobile ? '8px 10px' : '12px 20px',
          overflow: 'hidden'
        }}>
          <div className="history-day-meta">{historyMetaLabel}</div>
          <div className="card-deck-container" style={{ height: 'calc(100% - 34px)' }}>
            <CardDeckSlider
              labels={['Map View', 'Network View']}
              initialIndex={0}
              onActiveIndexChange={handleHistoryCardChange}
            >
              <div style={{ height: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                <MapContainer
                  ref={historyMapRef}
                  center={[37.0902, -95.7129]}
                  zoom={4}
                  style={{ height: '100%', width: '100%' }}
                  whenCreated={(map) => {
                    historyMapRef.current = map;
                  }}
                >
                  <TileLayer
                    url={MAP_STYLES[mapStyle].url}
                    attribution={MAP_STYLES[mapStyle].attribution}
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
                          textAlign: 'center',
                          backgroundColor: isReflectionTheme ? 'rgba(181, 126, 220, 0.14)' : 'transparent',
                          borderRadius: '8px'
                        }}>
                          <h3 style={{ margin: '0 0 10px 0', color: isReflectionTheme ? LAVENDER_COLOR : '#111' }}>ZIP Code: {point.id.replace('zip-', '')}</h3>
                          {isReflectionTheme ? (
                            <div>
                              <span style={{ color: LAVENDER_COLOR, fontWeight: 'bold' }}>
                                Reflected: {point.stats.reflected || 0}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'green' }}>Agree: {point.stats.agree}</span>
                              <span style={{ color: 'red' }}>Disagree: {point.stats.disagree}</span>
                            </div>
                          )}
                          <p style={{ margin: '10px 0 0 0' }}>Total Votes: {point.stats.total}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>

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
            </CardDeckSlider>
          </div>
        </div>
      )}

      {/* Add playback controls */}
      {selectedQuestion && <PlaybackControls />}

      {error && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '10px', 
          transform: 'none', 
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          display: 'flex',
          zIndex: 2001,
          alignItems: 'center'
        }}>
          <p style={{ color: 'red', margin: 0 }}>{error}</p>
        </div>
      )}
    </div>
  );
}

export default HistoryView; 