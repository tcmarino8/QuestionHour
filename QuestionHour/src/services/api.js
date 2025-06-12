import Question from '../models/Question';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://question-hour.vercel.app'  
  : 'http://localhost:3001';

// Initialize with empty question that will be populated from backend
export const CURRENT_QUESTION_OBJECT = new Question("", "");
export const CURRENT_QUESTION = CURRENT_QUESTION_OBJECT.text;
export const QUESTION_THEME = CURRENT_QUESTION_OBJECT.theme;
export const THEME_COLOR = "#4CAF50";

// Function to update the current question
export const updateCurrentQuestion = (question) => {
  CURRENT_QUESTION_OBJECT.text = question.text;
  CURRENT_QUESTION_OBJECT.theme = question.theme;
  CURRENT_QUESTION_OBJECT.current = question.current;
  CURRENT_QUESTION_OBJECT.timestamp = question.timestamp;
};

// Get current question
const getCurrentQuestion = async () => {
  console.log('Fetching current question from:', `${API_BASE_URL}/api/questions/current`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/questions/current`);
    const question = await handleResponse(response);
    updateCurrentQuestion(question);
    return question;
  } catch (error) {
    console.error('Error in getCurrentQuestion:', error);
    throw error;
  }
};

console.log('Environment:', process.env.NODE_ENV);
console.log('API Base URL:', API_BASE_URL);

const handleResponse = async (response) => {
  console.log('API Response status:', response.status);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('API Error:', error);
    throw new Error(error.message || 'Something went wrong');
  }
  return response.json();
};

export const api = {
  // Get current question
  getCurrentQuestion,

  // Get all responses
  getResponses: async () => {
    console.log('Fetching responses from:', `${API_BASE_URL}/api/responses`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/responses`);
      return handleResponse(response);
    } catch (error) {
      console.error('Error in getResponses:', error);
      throw error;
    }
  },

  // Add a new response
  addResponse: async (data) => {
    console.log('Adding response to:', `${API_BASE_URL}/api/responses`, data);
    try {
      const response = await fetch(`${API_BASE_URL}/api/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error in addResponse:', error);
      throw error;
    }
  },

  // Reset all data
  resetData: async () => {
    console.log('Resetting data at:', `${API_BASE_URL}/api/responses`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/responses`, {
        method: 'DELETE',
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error in resetData:', error);
      throw error;
    }
  },

  // Check server health
  checkHealth: async () => {
    console.log('Checking health at:', `${API_BASE_URL}/api/health`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      return handleResponse(response);
    } catch (error) {
      console.error('Error in checkHealth:', error);
      throw error;
    }
  },
}; 