import './App.css';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import { api } from './services/api';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function App() {
  const [graphData, setGraphData] = useState({
    nodes: [
      { id: 'question', name: 'Questionhour', color: 'blue', x: 0, y: 0, z: 0 }
    ],
    links: []
  });
  
  const [mapPoints, setMapPoints] = useState([]);
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fgRef = useRef(null);
  const mapRef = useRef(null);
  const networkContainerRef = useRef(null);
  const markerRefs = useRef({});

  // Function to get coordinates from ZIP code using Google Places API
  const getCoordinatesFromZip = async (zip) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&key=AIzaSyCRwTIg_AYz2gPW8QTHFv0whcE4ruXi_ns`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng
        };
      } else {
        throw new Error('Could not find coordinates for ZIP code');
      }
    } catch (error) {
      console.error('Error geocoding ZIP code:', error);
      throw error;
    }
  };

  // Function to reset zoom and center network
  const resetZoom = useCallback(() => {
    if (fgRef.current) {
      const containerWidth = networkContainerRef.current?.offsetWidth || 800;
      const containerHeight = networkContainerRef.current?.offsetHeight || 600;
      
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
  }, []);

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
      console.log('Fetching responses from backend...');
      const responses = await api.getResponses();
      console.log('Received responses:', responses);
      
      // Convert responses to graph data
      const nodes = [
        { id: 'question', name: 'Questionhour', color: 'blue', x: 0, y: 0, z: 0 }
      ];
      const links = [];
      const points = [];

      // Group responses by ZIP code for map statistics
      const zipStats = {};
      responses.forEach(response => {
        if (!zipStats[response.location]) {
          zipStats[response.location] = {
            agree: 0,
            disagree: 0,
            lat: response.lat,
            lng: response.lng
          };
        }
        if (response.response === 'agree') {
          zipStats[response.location].agree++;
        } else {
          zipStats[response.location].disagree++;
        }
      });

      // Create nodes and links
      responses.forEach((response, index) => {
        // console.log('Processing response:', response);
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
        // console.log('Created node:', node);
        nodes.push(node);

        // Add link to question
        const link = {
          source: 'question',
          target: nodeId,
          color: response.response === 'agree' ? 'green' : 'red',
          width: 4
        };
        // console.log('Created link:', link);
        links.push(link);
      });

      // Create map points with statistics
      Object.entries(zipStats).forEach(([zip, stats]) => {
        const point = {
          id: `zip-${zip}`,
          lat: stats.lat,
          lng: stats.lng,
          color: stats.agree >= stats.disagree ? 'green' : 'red',
          stats: {
            agree: stats.agree,
            disagree: stats.disagree,
            total: stats.agree + stats.disagree
          }
        };
        console.log('Created map point:', point);
        points.push(point);
      });

      // console.log('Final graph data:', { nodes, links });
      // console.log('Final map points:', points);

      setGraphData({ nodes, links });
      setMapPoints(points);
    } catch (error) {
      console.error('Error updating visualization:', error);
      setError('Failed to update visualization');
    }
  }, []);

  // Load initial data
  useEffect(() => {
    updateVisualization();
  }, [updateVisualization]);

  // Add a new vote
  async function addVote(sentiment) {
    if (!zipCode) {
      setError("Please enter your ZIP code first.");
      return;
    }

    try {
      const coords = await getCoordinatesFromZip(zipCode);
      
      // Store in backend first
      await api.addResponse({
        question: "You have been stung by a bee.",
        response: sentiment,
        timestamp: new Date().toISOString(),
        location: zipCode,
        lat: coords.lat,
        lng: coords.lng
      });

      // Update visualization from backend data
      await updateVisualization();
      
      setSuccessMessage(`Vote recorded for ZIP code ${zipCode}!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      setZipCode('');
      setTimeout(() => resetZoom(), 500);
    } catch (error) {
      setError("Could not record vote. Please try again.");
      console.error('Error adding vote:', error);
    }
  }

  // Function to reset all data
  const resetData = async () => {
    try {
      await api.resetData();
      await updateVisualization();
      setSuccessMessage('All data has been reset!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error resetting data:', error);
      setError('Failed to reset data');
    }
  };

  return (
    <div className="App">
      <div className="question-box" style={{
        margin: '30px auto 10px auto',
        padding: '20px',
        maxWidth: '600px',
        background: '#f9f9f9',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        fontSize: '1.4rem',
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#333'
      }}>
        Question of the Day: I have been stung by a bee...
      </div>
      <div className="controls">
        <input
          type="text"
          placeholder="Enter ZIP code"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          maxLength="5"
          pattern="[0-9]*"
        />
        <button onClick={() => addVote("agree")} style={{ backgroundColor: "green", margin: '5px', padding: '10px' }}>
          Agree
        </button>
        <button onClick={() => addVote("disagree")} style={{ backgroundColor: "red", margin: '5px', padding: '10px' }}>
          Disagree
        </button>
        <button onClick={resetZoom} style={{ margin: '5px', padding: '10px' }}>
          Reset View
        </button>
        <button onClick={resetData} style={{ backgroundColor: "#ff4444", margin: '5px', padding: '10px' }}>
          Reset All Data
        </button>
      </div>
      
      {error && <p className="error">{error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

      <div className="visualization-container">
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
            width={networkContainerRef.current?.offsetWidth}
            height={networkContainerRef.current?.offsetHeight}
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
    </div>
  );
}

export default App;