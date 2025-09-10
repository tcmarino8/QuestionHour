
import React, { useState } from 'react';
import { getQuestionBoxStyles, getThemeConfig, ANIMATIONS } from '../utils/themeUtils';
// import { api } from '../services/api';




const themeVisuals = {
  science_nature: ['🧬', '🌱', '🔬', '🌎', '🌻'],
  history_politics: ['🏛️', '📜', '🗳️', '⚖️', '🗺️'],
  technology_innovation: ['🤖', '💻', '📱', '🚀', '🛰️'],
  arts_culture: ['🎨', '🎭', '🎶', '📚', '🖼️'],
  society_ethics: ['🤝', '⚖️', '🧑‍🤝‍🧑', '🏳️‍🌈', '🕊️'],
  pop_culture: ['🎬', '🎤', '🎮', '📺', '🎧'],
  sports: ['⚽', '🏀', '🏈', '🎾', '🏇', '🏸', '🥎', '🥅'],
  reflection: ['🧘', '💭', '📖', '🌅', '🪞']
};



// const ThemedQuestion = ({ question, theme }) => {
//   const styles = getQuestionBoxStyles(theme);
//   const themeConfig = getThemeConfig(theme);
//   const visuals = themeVisuals[theme] || [];

//   return (
//     <>
//       <style>{ANIMATIONS + emojiAnim}</style>
//       <div style={styles.container}>
//         <span style={styles.icon}>{themeConfig.icon}</span>
//         <span style={styles.theme}>{theme}</span>
//         <div className="theme-visuals" style={{ fontSize: '2rem', marginBottom: 8 }}>
//           {visuals.map((v, i) => <span key={i} style={{ margin: '0 0.2em' }}>{v}</span>)}
//         </div>
//         <div style={styles.question}>{question}</div>
//       </div>
//     </>
//   );
// };

// export default ThemedQuestion; 




const emojiAnim = `
@keyframes float {
  0% { transform: translateY(0); }
  100% { transform: translateY(-10px) scale(1.1); }
}
.theme-visuals span {
  display: inline-block;
  animation: float 2s ease-in-out infinite alternate;
}
.theme-visuals span:nth-child(2) { animation-delay: 0.2s; }
.theme-visuals span:nth-child(3) { animation-delay: 0.4s; }
.theme-visuals span:nth-child(4) { animation-delay: 0.6s; }
.theme-visuals span:nth-child(5) { animation-delay: 0.8s; }
`;

const ThemedQuestion = ({ question, theme }) => {
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [newsSources, setNewsSources] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  
  const styles = getQuestionBoxStyles(theme);
  const themeConfig = getThemeConfig(theme);
  const visuals = themeVisuals[theme] || [];

  const handleInfoClick = async () => {
    console.log('🔍 Info icon clicked! Theme:', theme);
    
    if (newsSources.length === 0) {
      setLoadingNews(true);
      console.log('📡 Fetching news sources from backend...');
      
      try {
        // Use the correct backend URL
        const API_BASE_URL = process.env.NODE_ENV === 'production' 
          ? 'https://question-hour.vercel.app'  
          : 'http://localhost:3001';
        
        const response = await fetch(`${API_BASE_URL}/api/news/headlines`);
        console.log('📡 Response status:', response.status);
        console.log('📡 Response URL:', response.url);
        
        const data = await response.json();
        console.log('📡 Full response data:', data);
        console.log('📡 Headlines array:', data.headlines);
        console.log('📡 Number of headlines:', data.headlines?.length || 0);
        
        if (data.headlines && data.headlines.length > 0) {
          console.log('📰 First headline:', data.headlines[0]);
        }
        
        setNewsSources(data.headlines || []);
      } catch (error) {
        console.error('❌ Error fetching news:', error);
        setNewsSources([]);
      } finally {
        setLoadingNews(false);
      }
    } else {
        console.log('📰 Using cached news sources:', newsSources.length);
      }
      
      setShowNewsModal(true);
    };

  return (
    <>
      <style>{ANIMATIONS + emojiAnim}</style>
      <div style={styles.container}>
        <span style={styles.icon}>{themeConfig.icon}</span>
        <div 
          style={styles.infoIcon}
          onClick={handleInfoClick}
          title="View news sources"
        >
          i
        </div>
        <div className="theme-visuals" style={{ fontSize: '2rem', marginBottom: 8 }}>
          {visuals.map((v, i) => <span key={i} style={{ margin: '0 0.2em' }}>{v}</span>)}
        </div>
        <div style={styles.question}>{question}</div>
      </div>

      {/* News Sources Modal */}
      {showNewsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '20px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowNewsModal(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <h2 style={{ marginTop: 0, color: themeConfig.color }}>
              News Sources for Today's Question
            </h2>
            {loadingNews ? (
              <p>Loading news sources...</p>
            ) : newsSources.length > 0 ? (
              <div>
                {newsSources.map((article, index) => (
                  <div key={index} style={{ 
                    marginBottom: '15px', 
                    padding: '10px', 
                    border: '1px solid #ddd', 
                    borderRadius: '5px' 
                  }}>
                    <h4 style={{ margin: '0 0 5px 0' }}>{article.title}</h4>
                    <p style={{ margin: '0 0 5px 0', color: '#666' }}>{article.source}</p>
                    <a 
                      href={article.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: themeConfig.color }}
                    >
                      Read more →
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p>No news sources available for this question.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ThemedQuestion;