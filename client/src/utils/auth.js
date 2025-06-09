import axios from 'axios';

// Configure axios to include credentials (cookies) in requests
axios.defaults.withCredentials = true;

const API_BASE_URL = 'http://localhost:3001';

export const authAPI = {
  // Get current user info
  getCurrentUser: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/user`);
      return response.data.user;
    } catch (error) {
      if (error.response?.status === 401) {
        return null; // Not authenticated
      }
      throw error;
    }
  },

  // Logout user
  logout: async () => {
    try {
      await axios.post(`${API_BASE_URL}/auth/logout`);
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }
};

// Configure API calls to include credentials
export const apiCall = async (url, options = {}) => {
  try {
    const config = {
      ...options,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await axios(url, config);
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      // Redirect to login if not authenticated
      window.location.href = '/login';
      return;
    }
    throw error;
  }
}; 