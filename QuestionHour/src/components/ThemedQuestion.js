import React from 'react';
import { getQuestionBoxStyles, getThemeConfig, ANIMATIONS } from '../utils/themeUtils';

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
  const styles = getQuestionBoxStyles(theme);
  const themeConfig = getThemeConfig(theme);
  const visuals = themeVisuals[theme] || [];

  return (
    <>
      <style>{ANIMATIONS + emojiAnim}</style>
      <div style={styles.container}>
        <span style={styles.icon}>{themeConfig.icon}</span>
        <span style={styles.theme}>{theme}</span>
        <div className="theme-visuals" style={{ fontSize: '2rem', marginBottom: 8 }}>
          {visuals.map((v, i) => <span key={i} style={{ margin: '0 0.2em' }}>{v}</span>)}
        </div>
        <div style={styles.question}>{question}</div>
      </div>
    </>
  );
};

export default ThemedQuestion; 