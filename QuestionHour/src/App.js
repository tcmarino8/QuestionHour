import './App.css';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { getVoteButtonStyles } from './utils/themeUtils';
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import { api } from './services/api';
import { createGraphData, LAVENDER_COLOR } from './utils/visualizationUtils';
import CardDeckSlider from './components/CardDeckSlider';

// Map style configurations
// Get Stadia API key from environment variable
const STADIA_API_KEY = process.env.REACT_APP_STADIA_API_KEY;

export const MAP_STYLES = {
  default: {
    name: "Default",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  alidade_smooth: {
    name: "Alidade Smooth",
    url: `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
  },
  alidade_smooth_dark: {
    name: "Alidade Smooth Dark",
    url: `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
  },
  outdoors: {
    name: "Outdoors",
    url: `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
  },
  stamen_toner: {
    name: "Stamen Toner",
    url: `https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
  },
  stamen_terrain: {
    name: "Stamen Terrain",
    url: `https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
  },
  stamen_watercolor: {
    name: "Stamen Watercolor",
    url: `https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
  }
};

export const THEME_TO_MAP_STYLE = {
  general: 'stamen_toner',      // fallback/default
  technology_innovation: 'default',
  history_politics: 'alidade_smooth',
  science_nature: 'outdoors',
  society_ethics: 'stamen_terrain',
  arts_culture: 'stamen_watercolor',
  sports: 'alidade_smooth_dark',
  reflection: 'stamen_toner'
};

const THEME_VISUALS = {
  science_nature: ['🧬', '🌱', '🔬', '🌎', '🌻'],
  history_politics: ['🏛️', '📜', '🗳️', '⚖️', '🗺️'],
  technology_innovation: ['🤖', '💻', '📱', '🚀', '🛰️'],
  arts_culture: ['🎨', '🎭', '🎶', '📚', '🖼️'],
  society_ethics: ['🤝', '⚖️', '🕊️'],
  sports: ['⚽', '🏀', '🏈', '🎾', '🏇'],
  reflection: ['🧘', '💭', '📖', '🌅', '🪞'],
  general: ['✨', '💡', '🌐', '🧠']
};

const LA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getLaDateKey(dateLike) {
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return '';
  return LA_DATE_FORMATTER.format(parsed);
}

function formatLayerDayLabel(dateKey, todayKey) {
  if (!dateKey) return 'Unknown day';
  if (dateKey === todayKey) return 'Today';

  const today = new Date(`${todayKey}T12:00:00`);
  const layerDate = new Date(`${dateKey}T12:00:00`);

  if (!Number.isNaN(today.getTime()) && !Number.isNaN(layerDate.getTime())) {
    const diffDays = Math.round((today - layerDate) / 86400000);
    if (diffDays === 1) return 'Yesterday';
  }

  const friendly = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(friendly.getTime())) return dateKey;

  return friendly.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong.</h2>
          <pre style={{ textAlign: 'left', background: '#f5f5f5', padding: '10px' }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  console.log('App component rendering');
  const REFLECTED_TYPE = 'reflected';
  const [currentQuestion, setCurrentQuestion] = useState({ text: '', theme: 'general', aiGenerated: false });
  const [graphData, setGraphData] = useState({
    nodes: [
      { 
        id: 'question', 
        name: `Question: ${currentQuestion.text}`, 
        color: "#4CAF50", 
        x: 0, 
        y: 0, 
        z: 0,
        theme: currentQuestion.theme
      }
    ],
    links: []
  });
  
  const [mapPoints, setMapPoints] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
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
  const fgRef = useRef(null);
  const mapRef = useRef(null);
  const networkContainerRef = useRef(null);
  const markerRefs = useRef({});
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 500 });
  const [voteState, setVoteState] = useState({ hasVoted: false, response: null });
  const [liveDayLayers, setLiveDayLayers] = useState([]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [isLayerPlaying, setIsLayerPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackCursor, setPlaybackCursor] = useState(0);
  // Add new state for selected map style
  const [selectedMapStyle, setSelectedMapStyle] = useState('stamen_toner');
  const todayLaDateKey = useMemo(() => getLaDateKey(new Date()), []);
  const activeLayer = liveDayLayers[activeLayerIndex] || null;
  const sortedActiveLayerResponses = useMemo(() => {
    const responses = Array.isArray(activeLayer?.responses) ? [...activeLayer.responses] : [];
    responses.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return responses;
  }, [activeLayer]);
  const totalLayerResponses = sortedActiveLayerResponses.length;
  const playbackAtEnd = playbackCursor >= totalLayerResponses;
  const visibleLayerResponses = isPlaybackMode
    ? sortedActiveLayerResponses.slice(0, playbackCursor)
    : sortedActiveLayerResponses;
  const isMobile = viewportWidth <= 900;
  const currentThemeId = (activeLayer?.displayTheme || currentQuestion.theme || 'general').toLowerCase();
  const isReflectionTheme = currentThemeId === 'reflection';
  const metadataDate = activeLayer
    ? formatLayerDayLabel(activeLayer.dateKey, todayLaDateKey)
    : new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
  const dayThemeLabel = `${metadataDate} · ${currentThemeId.replace(/_/g, ' ')}`;
  const activeDisplayQuestion = activeLayer?.displayQuestionText || currentQuestion.text;
  const isViewingHistoricalLayer = Boolean(activeLayer && activeLayer.dateKey !== todayLaDateKey);
  const voteStorageKey = `qhour-vote-${currentQuestion.text || 'unknown'}`;
  const currentVisuals = THEME_VISUALS[currentThemeId] || THEME_VISUALS.general;

  useEffect(() => {
    if (!currentQuestion.text) return;
    try {
      const saved = localStorage.getItem(voteStorageKey);
      if (saved) {
        setVoteState(JSON.parse(saved));
      } else {
        setVoteState({ hasVoted: false, response: null });
      }
    } catch {
      setVoteState({ hasVoted: false, response: null });
    }
  }, [voteStorageKey, currentQuestion.text]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);

      if (networkContainerRef.current) {
        setGraphSize({
          width: Math.max(280, Math.floor(networkContainerRef.current.offsetWidth)),
          height: Math.max(240, Math.floor(networkContainerRef.current.offsetHeight))
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Function to fetch current question
  const fetchCurrentQuestion = useCallback(async () => {
    try {
      const question = await api.getCurrentQuestion();
      setCurrentQuestion(question);
    } catch (error) {
      console.error('Error fetching current question:', error);
      setError('Failed to fetch current question');
    }
  }, []);

  // Update graph data when current question changes
  useEffect(() => {
    if (activeLayer) return;

    setGraphData(prevData => ({
      ...prevData,
      nodes: prevData.nodes.map(node => 
        node.id === 'question' 
          ? { 
              ...node, 
              name: `Question: ${currentQuestion.text}`,
              theme: currentQuestion.theme
            }
          : node
      )
    }));
  }, [currentQuestion, activeLayer]);

  // Set map style based on selected layer/current theme
  useEffect(() => {
    const theme = currentThemeId;
    setSelectedMapStyle(THEME_TO_MAP_STYLE[theme] || 'stamen_toner');
  }, [currentThemeId]);


  // Function to get ZIP code from coordinates using Google Places API
  const getZipFromCoordinates = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyCRwTIg_AYz2gPW8QTHFv0whcE4ruXi_ns`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        // Find the ZIP code in the address components
        const addressComponents = data.results[0].address_components;
        const zipComponent = addressComponents.find(
          component => component.types.includes('postal_code')
        );
        return zipComponent ? zipComponent.long_name : null;
      }
      return null;
    } catch (error) {
      console.error('Error getting ZIP code:', error);
      return null;
    }
  };



  // Function to get user's location
  const getLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const zipCode = await getZipFromCoordinates(latitude, longitude);
         
          if (!zipCode) {
            setError("Could not determine ZIP code from your location");
            setIsLoading(false);
            return;
          }

          setUserLocation({
            lat: latitude + (Math.random() - 0.5) * 0.01,
            lng: longitude + (Math.random() - 0.5) * 0.01,
            zip: zipCode
          });
          setSuccessMessage('Location found! You can now vote.');
          setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
          console.error('Error in location handling:', error);
          setError("Could not get your location. Please try again.");
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setError("Could not get your location. Please check your browser settings.");
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  };

  // Function to reset zoom and center network
  const resetZoom = useCallback(() => {
    if (fgRef.current) {
      const containerWidth = graphSize.width;
      const containerHeight = graphSize.height;
      
      fgRef.current.cameraPosition(
        { x: 0, y: 0, z: Math.max(containerWidth, containerHeight) / 2 },
        { x: 0, y: 0, z: 0 },
        1500
      );
    }

    // Reset map view
    if (mapRef.current) {
      mapRef.current.setView([37.0902, -95.7129], 3);
    }
  }, [graphSize.height, graphSize.width]);

  // Handle node click
  const handleNodeClick = useCallback((node) => {
    if (fgRef.current) {
      const distance = 20;
      const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);

      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        3000
      );

      // If the node has a location (not the question node), show the corresponding map popup
      if (node.name && node.name.startsWith('ZIP:')) {
        const zip = node.name.replace('ZIP: ', '');
        const markerRef = markerRefs.current[`zip-${zip}`];
        if (markerRef) {
          markerRef.openPopup();
          // Center map on the marker
          mapRef.current.setView([markerRef.getLatLng().lat, markerRef.getLatLng().lng], 8);
        }
      }
    }
  }, []);

  // Function to fetch and update visualization data
  const updateVisualization = useCallback(async () => {
    try {
      console.log('Fetching current question responses from backend...');
      const responses = await api.getCurrentQuestionResponses();
      console.log('Received current question responses:', responses);
      
      const { graphData: newGraphData, mapPoints: newMapPoints, stats } = createGraphData(currentQuestion, responses);
      
      setGraphData(newGraphData);
      setMapPoints(newMapPoints);
      setResponseStats(stats);
    } catch (error) {
      console.error('Error updating visualization:', error);
      setError('Failed to update visualization');
    }
  }, [currentQuestion]);

  const applyLayerVisualization = useCallback((layer, layerResponses) => {
    const layerQuestion = {
      text: layer?.displayQuestionText || 'Daily aggregate',
      theme: layer?.displayTheme || 'general'
    };

    const { graphData: nextGraphData, mapPoints: nextMapPoints, stats } = createGraphData(
      layerQuestion,
      Array.isArray(layerResponses) ? layerResponses : []
    );

    setGraphData(nextGraphData);
    setMapPoints(nextMapPoints);
    setResponseStats(stats);
  }, []);

  const fetchLiveStack = useCallback(async () => {
    try {
      const stack = await api.getLiveStack(7);
      const layers = Array.isArray(stack?.layers) ? stack.layers : [];
      setLiveDayLayers(layers);
      setActiveLayerIndex((previous) => {
        if (layers.length === 0) return 0;
        return Math.min(previous, layers.length - 1);
      });
    } catch (stackError) {
      console.error('Error fetching live day stack:', stackError);
      setError('Failed to fetch live day layers');
    }
  }, []);

  const handleLiveCardChange = useCallback((index) => {
    if (index === 1 && mapRef.current) {
      setTimeout(() => mapRef.current.invalidateSize(), 120);
    }

    if (index === 2 && networkContainerRef.current) {
      setTimeout(() => {
        setGraphSize({
          width: Math.max(280, Math.floor(networkContainerRef.current.offsetWidth)),
          height: Math.max(240, Math.floor(networkContainerRef.current.offsetHeight))
        });
      }, 120);
    }
  }, []);

  const handleTogglePlayback = useCallback(() => {
    if (totalLayerResponses === 0) return;

    if (!isPlaybackMode) {
      setIsPlaybackMode(true);
      setPlaybackCursor(0);
      setIsLayerPlaying(true);
      return;
    }

    if (isLayerPlaying) {
      setIsLayerPlaying(false);
      return;
    }

    if (playbackAtEnd) {
      setPlaybackCursor(0);
    }

    setIsLayerPlaying(true);
  }, [isLayerPlaying, isPlaybackMode, playbackAtEnd, totalLayerResponses]);

  const handleShowFullLayer = useCallback(() => {
    setIsLayerPlaying(false);
    setIsPlaybackMode(false);
    setPlaybackCursor(totalLayerResponses);
  }, [totalLayerResponses]);


  // Poll current question + live day stack.
  useEffect(() => {
    const refresh = async () => {
      await fetchCurrentQuestion();
      await fetchLiveStack();
    };

    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [fetchCurrentQuestion, fetchLiveStack]);

  // Render stats/map/network from selected day layer when available.
  useEffect(() => {
    if (activeLayer) {
      applyLayerVisualization(activeLayer, visibleLayerResponses);
      return;
    }

    updateVisualization();
  }, [activeLayer, applyLayerVisualization, updateVisualization, visibleLayerResponses]);

  useEffect(() => {
    setIsPlaybackMode(false);
    setIsLayerPlaying(false);
    setPlaybackCursor(totalLayerResponses);
  }, [activeLayerIndex, totalLayerResponses]);

  useEffect(() => {
    if (!isPlaybackMode || !isLayerPlaying || totalLayerResponses === 0) return;

    const intervalTime = 500 / playbackSpeed;
    const interval = setInterval(() => {
      setPlaybackCursor((previous) => {
        if (previous >= totalLayerResponses) {
          setIsLayerPlaying(false);
          return previous;
        }

        return previous + 1;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isLayerPlaying, isPlaybackMode, playbackSpeed, totalLayerResponses]);

  // Add a new vote
  async function addVote(sentiment) {
    if (!userLocation) {
      setError("Please get your location first");
      return;
    }

    try {
      // Store in backend
      await api.addResponse({
        question: currentQuestion.text,
        response: sentiment,
        timestamp: new Date().toISOString(),
        location: userLocation.zip,
        lat: userLocation.lat,
        lng: userLocation.lng
      });

      await fetchLiveStack();
      setActiveLayerIndex(0);
      await updateVisualization();

      const nextVoteState = { hasVoted: true, response: sentiment };
      setVoteState(nextVoteState);
      try {
        localStorage.setItem(voteStorageKey, JSON.stringify(nextVoteState));
      } catch {
        // Ignore storage failures and keep in-memory state.
      }

      setSuccessMessage('Vote recorded!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setTimeout(() => resetZoom(), 500);
    } catch (error) {
      console.error('Error adding vote:', error);
      setError("Could not record vote. Please try again.");
    }
  }

  return (
    <div className="App">
      {showInfoPopup && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxWidth: isMobile ? 'calc(100vw - 30px)' : '400px',
          width: isMobile ? 'calc(100vw - 30px)' : 'auto',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '20px' }}>We just want to show where people are who are responding a certain way!</p>
          <button 
            onClick={() => setShowInfoPopup(false)}
            style={{
              padding: '8px 16px',
              borderRadius: '5px',
              border: 'none',
              backgroundColor: '#007bff',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Got it!
          </button>
        </div>
      )}

      <div className="live-day-meta">{dayThemeLabel}</div>
      {(voteState.hasVoted || activeLayer) && (
        <div className="live-top-question">{activeDisplayQuestion || 'Question of the day'}</div>
      )}
      <div className="live-depth-layout">
        <div className="live-depth-timeline" aria-label="Live depth timeline">
          {liveDayLayers.length === 0 ? (
            <div className="live-depth-empty">No response layers yet</div>
          ) : (
            liveDayLayers.map((layer, index) => (
              <button
                key={layer.dateKey}
                type="button"
                className={`live-depth-node ${index === activeLayerIndex ? 'is-active' : ''}`}
                onClick={() => setActiveLayerIndex(index)}
              >
                <span>{formatLayerDayLabel(layer.dateKey, todayLaDateKey)}</span>
                <small>{layer.responseCount} responses</small>
              </button>
            ))
          )}
        </div>

        <div className="live-depth-stage visualization-container card-deck-container">
          <div className="live-playback-controls">
            <button
              type="button"
              className="live-playback-btn"
              onClick={handleTogglePlayback}
              disabled={totalLayerResponses === 0}
            >
              {isLayerPlaying ? 'Pause Playback' : playbackAtEnd && isPlaybackMode ? 'Replay Playback' : 'Play Playback'}
            </button>

            <button
              type="button"
              className="live-playback-btn ghost"
              onClick={handleShowFullLayer}
              disabled={totalLayerResponses === 0 || (!isPlaybackMode && playbackAtEnd)}
            >
              Show Full Layer
            </button>

            <label className="live-playback-speed">
              Speed
              <select
                value={playbackSpeed}
                onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
              </select>
            </label>

            <div className="live-playback-count">
              Responses shown: {visibleLayerResponses.length} / {totalLayerResponses}
            </div>
          </div>

          <CardDeckSlider
            labels={['Question & Vote', 'Map View', 'Network View']}
            initialIndex={0}
            loop={true}
            onActiveIndexChange={handleLiveCardChange}
          >
            <div className="question-vote-card">
              <div className="question-vote-chip">Question Of The Day</div>
              <div className="question-vote-text">{activeDisplayQuestion || currentQuestion.text || 'Loading question...'}</div>

              <div className="question-float-row">
                {currentVisuals.map((icon, index) => (
                  <span key={`${icon}-${index}`} className="question-float-token" style={{ animationDelay: `${index * 0.15}s` }}>
                    {icon}
                  </span>
                ))}
              </div>

              {isViewingHistoricalLayer ? (
                <div className="question-analysis-grid">
                  <div className="analysis-box agree">
                    <span>Agree</span>
                    <strong>{responseStats.agreeCount}</strong>
                  </div>
                  <div className="analysis-box disagree">
                    <span>Disagree</span>
                    <strong>{responseStats.disagreeCount}</strong>
                  </div>
                  <div className="analysis-box reflected">
                    <span>Reflected</span>
                    <strong>{responseStats.reflectedCount || 0}</strong>
                  </div>
                  <div className="analysis-box total">
                    <span>Total</span>
                    <strong>{responseStats.totalResponses}</strong>
                  </div>
                  <div className="analysis-user-response">
                    Historical layer selected. Voting is only available for today.
                  </div>
                </div>
              ) : !voteState.hasVoted ? (
                <>
                  <div className="question-vote-actions">
                    <button
                      onClick={getLocation}
                      className="question-vote-btn location"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Getting Location...' : 'Get My Location'}
                    </button>

                    {isReflectionTheme ? (
                      <button
                        onClick={() => addVote(REFLECTED_TYPE)}
                        className="question-vote-btn reflected"
                        disabled={!userLocation}
                      >
                        A gentle reflection!
                      </button>
                    ) : (
                      <div className="question-vote-split">
                        <button
                          onClick={() => addVote('agree')}
                          style={{
                            ...getVoteButtonStyles(currentQuestion.theme || 'general', 'agree'),
                            opacity: !userLocation ? 0.5 : 1
                          }}
                          disabled={!userLocation}
                        >
                          Agree
                        </button>
                        <button
                          onClick={() => addVote('disagree')}
                          style={{
                            ...getVoteButtonStyles(currentQuestion.theme || 'general', 'disagree'),
                            opacity: !userLocation ? 0.5 : 1
                          }}
                          disabled={!userLocation}
                        >
                          Disagree
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => setShowInfoPopup(true)}
                      className="question-vote-btn info"
                    >
                      Why do you need my location?
                    </button>
                  </div>

                  {error && <p className="error" style={{ marginTop: '8px' }}>{error}</p>}
                  {successMessage && <p className="success" style={{ marginTop: '8px' }}>{successMessage}</p>}
                </>
              ) : (
                <div className="question-analysis-grid">
                  <div className="analysis-box agree">
                    <span>Agree</span>
                    <strong>{responseStats.agreeCount}</strong>
                  </div>
                  <div className="analysis-box disagree">
                    <span>Disagree</span>
                    <strong>{responseStats.disagreeCount}</strong>
                  </div>
                  <div className="analysis-box reflected">
                    <span>Reflected</span>
                    <strong>{responseStats.reflectedCount || 0}</strong>
                  </div>
                  <div className="analysis-box total">
                    <span>Total</span>
                    <strong>{responseStats.totalResponses}</strong>
                  </div>
                  <div className="analysis-user-response">
                    Your response today: <b>{voteState.response}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="map-visualization">
              <MapContainer
                ref={mapRef}
                center={[37.0902, -95.7129]}
                zoom={4}
                style={{ height: '100%', width: '100%' }}
                whenCreated={(map) => {
                  mapRef.current = map;
                }}
              >
                <TileLayer
                  url={MAP_STYLES[selectedMapStyle].url}
                  attribution={MAP_STYLES[selectedMapStyle].attribution}
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
                    ref={ref => {
                      if (ref) {
                        markerRefs.current[point.id] = ref;
                      }
                    }}
                    eventHandlers={{
                      click: () => {
                        mapRef.current.setView([point.lat, point.lng], 10);
                      }
                    }}
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

            <div className="network-visualization" ref={networkContainerRef}>
              <ForceGraph3D
                ref={fgRef}
                graphData={graphData}
                nodeAutoColorBy="color"
                nodeLabel="name"
                linkColor='color'
                linkWidth={4}
                linkDirectionalParticles={2}
                linkDirectionalParticleWidth={2}
                onNodeClick={handleNodeClick}
                enableNodeDrag={true}
                enableNavigationControls={true}
                enablePointerInteraction={true}
                width={graphSize.width}
                height={graphSize.height}
                cooldownTicks={100}
                onEngineStop={() => fgRef.current?.zoomToFit(400)}
              />
            </div>
          </CardDeckSlider>
        </div>
      </div>
    </div>
  );
}

// Wrap the App export with ErrorBoundary
export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}