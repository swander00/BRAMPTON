import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const propertyApi = {
  // Get properties with pagination and filtering
  getProperties: async (params = {}) => {
    const response = await api.get('/properties', { params });
    return response.data;
  },

  // Get a single property by listing key
  getProperty: async (listingKey) => {
    const response = await api.get(`/properties/${listingKey}`);
    return response.data;
  },

  // Search properties with advanced filters
  searchProperties: async (searchParams = {}) => {
    const response = await api.get('/properties/search', { params: searchParams });
    return response.data;
  },

  // Get property media
  getPropertyMedia: async (listingKey, options = {}) => {
    const response = await api.get(`/properties/${listingKey}/media`, { params: options });
    return response.data;
  },

  // Get property statistics
  getPropertyStats: async () => {
    const response = await api.get('/properties/stats');
    return response.data;
  },
};

export default api;
