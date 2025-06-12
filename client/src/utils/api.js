// API configuration that works in both development and production
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';

export { API_BASE_URL }; 