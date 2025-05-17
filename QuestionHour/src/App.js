import './App.css';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from "leaflet";





// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function App() {
  const [graphData, setGraphData] = useState(() => {
    // Load initial data from localStorage or use default
    const savedData = localStorage.getItem('graphData');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      // Ensure links have proper source and target references
      const nodes = parsedData.nodes || [];
      const links = parsedData.links || [];
      return {
        nodes,
        links: links.map(link => ({
          ...link,
          source: typeof link.source === 'string' ? link.source : nodes.find(n => n.id === link.source.id) || link.source,
          target: typeof link.target === 'string' ? link.target : nodes.find(n => n.id === link.target.id) || link.target
        }))
      };
    }
    return {
      nodes: [
        { id: 'question', name: 'Questionhour', color: 'blue', x: 0, y: 0, z: 0 }
      ],
      links: []
    };
  });
  
  const [mapPoints, setMapPoints] = useState(() => {
    // Load map points from localStorage or use empty array
    const savedPoints = localStorage.getItem('mapPoints');
    return savedPoints ? JSON.parse(savedPoints) : [];
  });

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('graphData', JSON.stringify(graphData));
  }, [graphData]);

  useEffect(() => {
    localStorage.setItem('mapPoints', JSON.stringify(mapPoints));
  }, [mapPoints]);

  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fgRef = useRef(null);
  const mapRef = useRef(null);
  const networkContainerRef = useRef(null);

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
      // Center the network in its container
      const containerWidth = networkContainerRef.current?.offsetWidth || 800;
      const containerHeight = networkContainerRef.current?.offsetHeight || 600;
      
      fgRef.current.cameraPosition(
        { x: 0, y: 0, z: Math.max(containerWidth, containerHeight) / 2 },
        { x: 0, y: 0, z: 0 },
        1500
      );
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
    }
  }, []);

  // Function to reset all data
  const resetData = () => {
    const initialData = {
      nodes: [
        { id: 'question', name: 'Questionhour', color: 'blue', x: 0, y: 0, z: 0 }
      ],
      links: []
    };
    setGraphData(initialData);
    setMapPoints([]);
    localStorage.setItem('graphData', JSON.stringify(initialData));
    localStorage.setItem('mapPoints', JSON.stringify([]));
    setSuccessMessage('All data has been reset!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Add a new vote node
  async function addVote(sentiment) {
    if (!zipCode) {
      setError("Please enter your ZIP code first.");
      return;
    }

    try {
      const coords = await getCoordinatesFromZip(zipCode);
      const voteId = `vote-${zipCode}-${Date.now()}`;
      const voteColor = sentiment === "agree" ? "green" : "red";
      
      // Calculate new node position in a circle around the question
      const angle = Math.random() * Math.PI * 2;
      const radius = 100;
      const newX = Math.cos(angle) * radius;
      const newY = Math.sin(angle) * radius;
      const newZ = (Math.random() - 0.5) * 50;

      setGraphData(prevData => {
        // Find existing nodes with the same ZIP code
        const sameZipNodes = prevData.nodes.filter(node => 
          node.id.startsWith(`vote-${zipCode}-`)
        );

        // Create new links array starting with the question link
        const newLinks = [...prevData.links, { 
          source: 'question', 
          target: voteId,
          color: voteColor,
          width: 4
        }];

        // Add links to all existing nodes with the same ZIP code
        sameZipNodes.forEach(node => {
          newLinks.push({
            source: node.id,
            target: voteId,
            color: 'purple', // Different color for ZIP code connections
            width: 4 // Make ZIP code connections more visible
          });
        });

        return {
          nodes: [...prevData.nodes, { 
            id: voteId,
            name: `ZIP: ${zipCode}`,
            color: voteColor,
            x: newX,
            y: newY,
            z: newZ
          }],
          links: newLinks
        };
      });

      setMapPoints(prevPoints => [...prevPoints, {
        id: voteId,
        lat: coords.lat,
        lng: coords.lng,
        color: voteColor,
        intensity: 1
      }]);

      setSuccessMessage(`Vote recorded for ZIP code ${zipCode}!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      setZipCode('');
      setTimeout(() => resetZoom(), 500);
    } catch (error) {
      setError("Could not find location for this ZIP code. Please try again.");
      console.error('Error adding vote:', error);
    }
  }

  // const storeResponse = (response) => {
  //   const responses = JSON.parse(localStorage.getItem('responses') || '[]');
  //   responses.push({
  //     question: "You have been stung by a bee.",
  //     response: response,
  //     timestamp: new Date().toISOString(),
  //     location: zipCode
  //   });
  //   localStorage.setItem('responses', JSON.stringify(responses));
  // };

  const storeResponse = async (response) => {
    try {
      const result = await fetch('/api/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: "You have been stung by a bee.",
          response: response,
          timestamp: new Date().toISOString(),
          location: zipCode
        })
      });
      if (!result.ok) {
        throw new Error('Failed to store response');
      }
    } catch (error) {
      console.error('Error storing response:', error);
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
              //  <HeatmapLayer points={mapPoints} />
              <CircleMarker
                key={point.id}
                center={[point.lat, point.lng]}
                radius={10}
                fillColor={point.color}
                color="#fff"
                weight={1}
                fillOpacity={0.7}
              />
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

export default App;
// import React, { useState } from "react";
// import { motion } from "framer-motion";
// import ForceGraph3D from "react-force-graph-3d";
// import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
// import "leaflet/dist/leaflet.css";
// import "./RotatingCard.css";

// const RotatingCard = ({ graphData, mapPoints }) => {
//   const [side, setSide] = useState(0);

//   const handleClick = () => {
//     setSide((prev) => (prev + 1) % 3);
//   };

//   return (
//     <motion.div
//       className="card-container"
//       animate={{ rotateY: side * 120 }}
//       transition={{ duration: 0.8 }}
//       onClick={handleClick}
//     >
//       <div className="card-face card-question">
//         <div className="peel-corner top-left"></div>
//         <div className="peel-corner top-right"></div>
//         <div className="peel-corner bottom-left"></div>
//         <div className="peel-corner bottom-right"></div>
//         <h2>Is the current political climate benefiting my line of work?</h2>
//       </div>
//       <div className="card-face card-network">
//         <div className="peel-corner top-left"></div>
//         <div className="peel-corner top-right"></div>
//         <div className="peel-corner bottom-left"></div>
//         <div className="peel-corner bottom-right"></div>
//         <ForceGraph3D graphData={graphData} nodeAutoColorBy="color" />
//       </div>
//       <div className="card-face card-map">
//         <div className="peel-corner top-left"></div>
//         <div className="peel-corner top-right"></div>
//         <div className="peel-corner bottom-left"></div>
//         <div className="peel-corner bottom-right"></div>
//         <MapContainer center={[37.0902, -95.7129]} zoom={4} className="map-container">
//           <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
//           {mapPoints.map((point) => (
//             <CircleMarker
//               key={point.id}
//               center={[point.lat, point.lng]}
//               radius={10}
//               fillColor={point.color}
//               color="#fff"
//               weight={1}
//               fillOpacity={0.7}
//             />
//           ))}
//         </MapContainer>
//       </div>
//     </motion.div>
//   );
// };

// export default RotatingCard;