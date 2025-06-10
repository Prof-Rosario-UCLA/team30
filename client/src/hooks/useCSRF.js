import { useState, useEffect, useCallback } from 'react';

export const useCSRF = () => {
  const [csrfToken, setCsrfToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCSRFToken = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:3001/api/csrf-token', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch CSRF token');
      }
      
      const data = await response.json();
      setCsrfToken(data.csrfToken);
      console.log('CSRF token fetched successfully');
    } catch (err) {
      setError(err.message);
      console.error('CSRF token fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCSRFToken();
  }, [fetchCSRFToken]);

  // Refresh token if request fails with CSRF error
  const refreshToken = useCallback(async () => {
    console.log('Refreshing CSRF token...');
    await fetchCSRFToken();
  }, [fetchCSRFToken]);

  return { csrfToken, loading, error, refreshToken, isReady: !loading && csrfToken };
}; 