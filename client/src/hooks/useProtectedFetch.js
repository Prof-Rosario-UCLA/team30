import { useCallback } from 'react';
import { useCSRF } from './useCSRF';

export const useProtectedFetch = () => {
  const { csrfToken, refreshToken, isReady } = useCSRF();

  const protectedFetch = useCallback(async (url, options = {}) => {
    if (!isReady) {
      throw new Error('CSRF token not ready');
    }

    // Add CSRF token to headers for non-GET requests
    const enhancedOptions = {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
      }
    };

    // Add CSRF token for non-GET requests
    if (options.method && options.method.toUpperCase() !== 'GET') {
      enhancedOptions.headers['X-CSRF-Token'] = csrfToken;
    }

    try {
      const response = await fetch(url, enhancedOptions);
      
      // If CSRF error, refresh token and retry once
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'CSRF_TOKEN_INVALID') {
          console.log('CSRF token invalid, refreshing and retrying...');
          await refreshToken();
          
          // Retry with new token
          enhancedOptions.headers['X-CSRF-Token'] = csrfToken;
          return fetch(url, enhancedOptions);
        }
      }
      
      return response;
    } catch (error) {
      console.error('Protected fetch error:', error);
      throw error;
    }
  }, [csrfToken, refreshToken, isReady]);

  return { protectedFetch, csrfToken, isReady };
}; 