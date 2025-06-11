const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://question-hour.vercel.app'  // Replace with your actual Vercel URL
  : 'http://localhost:3001';

export const CURRENT_QUESTION = "I arrived to work before 9am today...";
export const QUESTION_THEME = "transportation";
export const THEME_COLOR = "#4CAF50"

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