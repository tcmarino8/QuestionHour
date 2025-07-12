import React from 'react';
import { getQuestionBoxStyles, getThemeConfig, ANIMATIONS } from '../utils/themeUtils';

const ThemedQuestion = ({ question, theme }) => {
  const styles = getQuestionBoxStyles(theme);
  const themeConfig = getThemeConfig(theme);

  return (
    <>
      <style>{ANIMATIONS}</style>
      <div style={styles.container}>
        <span style={styles.icon}>{themeConfig.icon}</span>
        <span style={styles.theme}>{theme}</span>
        <div style={styles.question}>{question}</div>
      </div>
    </>
  );
};

export default ThemedQuestion; 