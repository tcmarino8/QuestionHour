import './App.css';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import ThemedQuestion from './components/ThemedQuestion';
import { getVoteButtonStyles } from './utils/themeUtils';
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import { api } from './services/api';
import HistoryView from './components/HistoryView';
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
  const [showHistory, setShowHistory] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 500 });
  // Add new state for selected map style
  const [selectedMapStyle, setSelectedMapStyle] = useState('stamen_toner');
  const isMobile = viewportWidth <= 900;
  const isSmallMobile = viewportWidth <= 480;
  const isReflectionTheme = (currentQuestion.theme || '').toLowerCase() === 'reflection';
  const metadataDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
  const dayThemeLabel = `${metadataDate} · ${(currentQuestion.theme || 'general').replace(/_/g, ' ')}`;

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

  // Poll for current question updates every 30 seconds
  useEffect(() => {
    fetchCurrentQuestion();
    const interval = setInterval(fetchCurrentQuestion, 30000);
    return () => clearInterval(interval);
  }, [fetchCurrentQuestion]);

  // Update graph data when current question changes
  useEffect(() => {
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
  }, [currentQuestion]);

    // Set map style based on current theme/day
  useEffect(() => {
    // Use the theme from the current question, fallback to 'general'
    const theme = (currentQuestion.theme || 'general').toLowerCase();
    setSelectedMapStyle(THEME_TO_MAP_STYLE[theme] || 'stamen_toner');
  }, [currentQuestion.theme]);


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

  const handleLiveCardChange = useCallback((index) => {
    if (index === 1 && mapRef.current) {
      setTimeout(() => mapRef.current.invalidateSize(), 120);
    }

    if (index === 0 && networkContainerRef.current) {
      setTimeout(() => {
        setGraphSize({
          width: Math.max(280, Math.floor(networkContainerRef.current.offsetWidth)),
          height: Math.max(240, Math.floor(networkContainerRef.current.offsetHeight))
        });
      }, 120);
    }
  }, []);


  // Load initial data
  useEffect(() => {
    updateVisualization();
  }, [updateVisualization]);

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

      await updateVisualization();
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
      {/* History Dropdown */}
      <div style={{
        position: 'fixed',
        top: isMobile ? '10px' : '20px',
        left: isMobile ? '10px' : '20px',
        zIndex: 1000
      }}>
        <button
          onClick={() => setShowHistory(true)}
          style={{
            padding: isSmallMobile ? '8px 12px' : '10px 20px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: isSmallMobile ? '0.85rem' : '1rem'
          }}
        >
          <span>Question History</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4L6 8L10 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <ThemedQuestion 
        question={currentQuestion.text} 
        theme={currentQuestion.theme || 'general'} 
        aiGenerated={Boolean(currentQuestion.aiGenerated)}
      />

      {/* Stats Panel Toggle Button */}
      <div style={{
        position: 'fixed',
        top: isMobile ? '10px' : '20px',
        right: isMobile ? '10px' : '20px',
        zIndex: 1000
      }}>
        <button
          onClick={() => setShowStatsPanel(!showStatsPanel)}
          style={{
            padding: isSmallMobile ? '8px 12px' : '10px 20px',
            background: showStatsPanel ? '#666' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.3s ease',
            fontSize: isSmallMobile ? '0.85rem' : '1rem'
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
        bottom: showStatsPanel ? '20px' : '-400px',
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
        margin: isMobile ? '12px 8px' : '20px 0',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 900
      }}>
        <button 
          onClick={getLocation}
          style={{ 
            backgroundColor: "#007bff",
            padding: isSmallMobile ? '8px 12px' : '10px 20px',
            borderRadius: '5px',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            opacity: isLoading ? 0.7 : 1,
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            fontSize: isSmallMobile ? '0.85rem' : '1rem'
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Getting Location...' : 'Get My Location'}
        </button>
        {isReflectionTheme ? (
          <button
            onClick={() => addVote(REFLECTED_TYPE)}
            style={{
              backgroundColor: LAVENDER_COLOR,
              padding: isSmallMobile ? '8px 12px' : '12px 20px',
              borderRadius: '25px',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              opacity: !userLocation ? 0.5 : 1,
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              fontWeight: 'bold',
              fontSize: isSmallMobile ? '0.85rem' : '1rem'
            }}
            disabled={!userLocation}
          >
            A gentle reflection!
          </button>
        ) : (
          <>
            <button 
              onClick={() => addVote("agree")} 
              style={{ 
                ...getVoteButtonStyles(currentQuestion.theme || 'general', 'agree'),
                opacity: !userLocation ? 0.5 : 1,
              }}
              disabled={!userLocation}
            >
              Agree
            </button>
            <button 
              onClick={() => addVote("disagree")} 
              style={{ 
                ...getVoteButtonStyles(currentQuestion.theme || 'general', 'disagree'),
                opacity: !userLocation ? 0.5 : 1,
              }}
              disabled={!userLocation}
            >
              Disagree
            </button>
          </>
        )}
        <button 
          onClick={resetZoom} 
          style={{ 
            backgroundColor: 'black',
            padding: isSmallMobile ? '8px 12px' : '10px 20px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            cursor: 'pointer',
            color: 'white',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            fontSize: isSmallMobile ? '0.85rem' : '1rem'
          }}
        >
          Reset View
        </button>

        <button 
          onClick={() => setShowInfoPopup(true)}
          style={{ 
            padding: isSmallMobile ? '8px 12px' : '10px 20px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            cursor: 'pointer',
            backgroundColor: 'black',
            color: 'white',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            fontSize: isSmallMobile ? '0.85rem' : '1rem'
          }}
        >
          Why do you need my location?
        </button>
      </div>
      
      {error && <p className="error" style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
      {successMessage && <p className="success" style={{ color: 'green', textAlign: 'center' }}>{successMessage}</p>}
      {isLoading && <p style={{ textAlign: 'center' }}>Getting your location...</p>}

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
      <div className="visualization-container card-deck-container">
        <CardDeckSlider
          labels={['Network View', 'Map View']}
          initialIndex={0}
          onActiveIndexChange={handleLiveCardChange}
        >
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
        </CardDeckSlider>
      </div>
      {showHistory && <HistoryView onClose={() => setShowHistory(false)} />}
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