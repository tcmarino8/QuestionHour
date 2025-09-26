

// Theme definitions with associated colors, icons, backgrounds, and animations
export const THEMES = {
  general: {
    color: '#4CAF50',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    animation: 'pulse',
  },
  science_nature: {
    color: "#4CAF50",
    background: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
    animation: "shake",
  },
  history_politics: {
    color: "#F44336", 
    background: "linear-gradient(135deg, #780206 0%, #061161 100%)",
    animation: "float",
  },
  technology_innovation: {
    color: "#2196F3",
    background: "linear-gradient(135deg, #0c2461 0%, #1e3799 100%)",
    animation: "pulse",
  },
  arts_culture: {
    color: "#FF9800",
    background: "linear-gradient(135deg, #cc2b5e 0%, #753a88 100%)", 
    animation: "shake",
  },
  society_ethics: {
    color: "#9C27B0",
    background: "linear-gradient(135deg, #6a0572 0%, #ab83a1 100%)",
    animation: "float",
  },
  sports: {
    color: "#FF5722",
    background: "linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)",
    animation: "shake",
  },
  reflection: {
    color: "#9C27B0",
    background: "linear-gradient(135deg, #6a0572 0%, #ab83a1 100%)",
    animation: "float",
  },
};

// CSS Keyframes for animations
export const ANIMATIONS = `
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }

  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
    100% { transform: translateY(0px); }
  }

  @keyframes wave {
    0% { transform: rotate(0deg); }
    25% { transform: rotate(-5deg); }
    75% { transform: rotate(5deg); }
    100% { transform: rotate(0deg); }
  }

  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-15px); }
  }

  @keyframes zoom {
    0% { transform: scale(0.95); }
    50% { transform: scale(1.05); }
    100% { transform: scale(0.95); }
  }

  @keyframes slide {
    0% { transform: translateX(-10px); }
    100% { transform: translateX(10px); }
  }
`;

// Get theme configuration for a given theme
export const getThemeConfig = (theme) => {
  return THEMES[theme.toLowerCase()] || THEMES.general;
};

// Generate theme-based styles for question box
export const getQuestionBoxStyles = (theme) => {
  const themeConfig = getThemeConfig(theme);
  
  return {
    container: {
      margin: '30px auto 10px auto',
      padding: '25px',
      maxWidth: '600px',
      background: 'rgba(0, 0, 0, 0.85)',
      borderRadius: '20px',
      boxShadow: `0 0 30px ${themeConfig.color}40`,
      color: '#fff',
      position: 'relative',
      overflow: 'hidden',
      animation: `${themeConfig.animation} 3s infinite ease-in-out`,
      border: `2px solid ${themeConfig.color}`,
    },
    infoIcon: {
      position: 'absolute',
      top: '15px',
      right: '15px',
      fontSize: '20px',
      color: themeConfig.color,
      cursor: 'pointer',
      padding: '5px',
      borderRadius: '50%',
      transition: 'all 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '30px',
      height: '30px',
      background: 'rgba(255, 255, 255, 0.1)',
    },
    theme: {
      position: 'absolute',
      top: '15px',
      right: '15px',
      fontSize: '1rem',
      color: themeConfig.color,
      textTransform: 'capitalize',
      fontWeight: 'bold',
      textShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
    },
    question: {
      fontSize: '1.8rem',
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: '20px',
      color: '#ffffff',
      textShadow: '0 0 10px rgba(0, 0, 0, 0.8)',
      letterSpacing: '0.5px',
      lineHeight: '1.4',
    }
  };
};

// Generate theme-based styles for vote buttons
export const getVoteButtonStyles = (theme, type) => {
  const themeConfig = getThemeConfig(theme);
  const baseStyle = {
    padding: '12px 25px',
    borderRadius: '25px',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
  };

  // Use themeConfig color for hover effects
  const agreeGradient = `linear-gradient(135deg, ${themeConfig.color} 0%, ${adjustColor(themeConfig.color, -20)} 100%)`;
  const disagreeGradient = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';

  if (type === 'agree') {
    return {
      ...baseStyle,
      background: agreeGradient,
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: `0 4px 10px ${themeConfig.color}66`, // Add 66 for 40% opacity
      }
    };
  }

  return {
    ...baseStyle,
    background: disagreeGradient,
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 10px rgba(231, 76, 60, 0.4)',
    }
  };
};

// Helper function to darken/lighten colors
function adjustColor(color, amount) {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  
  r = Math.min(Math.max(0, r), 255);
  g = Math.min(Math.max(0, g), 255);
  b = Math.min(Math.max(0, b), 255);
  
  return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
} 