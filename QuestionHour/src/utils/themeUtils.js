import React from 'react';

// Theme definitions with associated colors, icons, and backgrounds
export const THEMES = {
  general: {
    color: '#4CAF50',
    icon: '❓',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    animation: 'pulse',
  },
  technology: {
    color: '#2196F3',
    icon: '💻',
    background: 'linear-gradient(135deg, #0c2461 0%, #1e3799 100%)',
    animation: 'float',
  },
  society: {
    color: '#9C27B0',
    icon: '👥',
    background: 'linear-gradient(135deg, #6a0572 0%, #ab83a1 100%)',
    animation: 'wave',
  },
  environment: {
    color: '#4CAF50',
    icon: '🌍',
    background: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    animation: 'rotate',
  },
  politics: {
    color: '#F44336',
    icon: '🏛️',
    background: 'linear-gradient(135deg, #780206 0%, #061161 100%)',
    animation: 'shake',
  },
  culture: {
    color: '#FF9800',
    icon: '🎭',
    background: 'linear-gradient(135deg, #cc2b5e 0%, #753a88 100%)',
    animation: 'bounce',
  },
  science: {
    color: '#00BCD4',
    icon: '🔬',
    background: 'linear-gradient(135deg, #2C3E50 0%, #3498DB 100%)',
    animation: 'zoom',
  },
  health: {
    color: '#E91E63',
    icon: '❤️',
    background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
    animation: 'pulse',
  },
  education: {
    color: '#795548',
    icon: '📚',
    background: 'linear-gradient(135deg, #373B44 0%, #4286f4 100%)',
    animation: 'slide',
  }
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
      padding: '20px',
      maxWidth: '600px',
      background: themeConfig.background,
      borderRadius: '12px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
      color: '#fff',
      position: 'relative',
      overflow: 'hidden',
      animation: `${themeConfig.animation} 3s infinite ease-in-out`,
    },
    icon: {
      position: 'absolute',
      top: '10px',
      left: '10px',
      fontSize: '24px',
    },
    theme: {
      position: 'absolute',
      top: '10px',
      right: '10px',
      fontSize: '0.9rem',
      opacity: 0.8,
      textTransform: 'capitalize',
    },
    question: {
      fontSize: '1.4rem',
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: '20px',
      textShadow: '1px 1px 3px rgba(0,0,0,0.2)',
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

  if (type === 'agree') {
    return {
      ...baseStyle,
      background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: '0 4px 10px rgba(46, 204, 113, 0.4)',
      }
    };
  }

  return {
    ...baseStyle,
    background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 10px rgba(231, 76, 60, 0.4)',
    }
  };
}; 