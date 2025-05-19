const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Something went wrong');
  }
  return response.json();
};

export const api = {
  // Get all responses
  getResponses: async () => {
    const response = await fetch(`${API_BASE_URL}/api/responses`);
    return handleResponse(response);
  },

  // Add a new response
  addResponse: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  // Reset all data
  resetData: async () => {
    const response = await fetch(`${API_BASE_URL}/api/responses`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  // Check server health
  checkHealth: async () => {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return handleResponse(response);
  },
}; 