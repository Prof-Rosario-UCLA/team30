const API_BASE_URL = 'http://localhost:3001';

export const authAPI = {
  // Get current user info
  getCurrentUser: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/user`, {
        credentials: 'include'
      });
      
      if (response.status === 401) {
        return null; // Not authenticated
      }
      
      if (!response.ok) {
        throw new Error('Failed to get user');
      }
      
      const data = await response.json();
      return data.user;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  },

  // Logout user - needs CSRF protection
  logout: async (csrfToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }
}; 