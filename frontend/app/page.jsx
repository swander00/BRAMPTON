'use client';

import { useState, useEffect } from 'react';
import { propertyApi } from '../lib/api';
import PropertyCard from '../components/PropertyCard';
import SearchFilters from '../components/SearchFilters';
import { formatPrice } from '../lib/utils';
import { Home, TrendingUp, MapPin, Users } from 'lucide-react';

export default function HomePage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({
    city: '',
    propertyType: '',
    minPrice: '',
    maxPrice: '',
    bedrooms: '',
    bathrooms: '',
    status: '',
    sortBy: 'ModificationTimestamp',
    sortOrder: 'desc'
  });

  // Fetch properties
  const fetchProperties = async (searchParams = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        page: 1,
        limit: 20,
        ...filters,
        ...searchParams
      };

      const response = await propertyApi.getProperties(params);
      
      if (response.success) {
        setProperties(response.data || []);
        setPagination(response.pagination || {});
      } else {
        setError('Failed to fetch properties');
      }
    } catch (err) {
      console.error('Error fetching properties:', err);
      setError(err.response?.data?.message || 'Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const response = await propertyApi.getPropertyStats();
      if (response.success) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProperties();
    fetchStats();
  }, []);

  // Handle search
  const handleSearch = (query) => {
    if (query.trim()) {
      fetchProperties({ query });
    } else {
      fetchProperties();
    }
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    if (key === 'clear') {
      const clearedFilters = {
        city: '',
        propertyType: '',
        minPrice: '',
        maxPrice: '',
        bedrooms: '',
        bathrooms: '',
        status: '',
        sortBy: 'ModificationTimestamp',
        sortOrder: 'desc'
      };
      setFilters(clearedFilters);
      fetchProperties(clearedFilters);
    } else {
      const newFilters = { ...filters, [key]: value };
      setFilters(newFilters);
      fetchProperties(newFilters);
    }
  };

  // Load more properties
  const loadMore = async () => {
    if (pagination.hasNextPage) {
      try {
        setLoading(true);
        const params = {
          ...filters,
          page: pagination.currentPage + 1,
          limit: 20
        };

        const response = await propertyApi.getProperties(params);
        
        if (response.success) {
          setProperties(prev => [...prev, ...(response.data || [])]);
          setPagination(response.pagination || {});
        }
      } catch (err) {
        console.error('Error loading more properties:', err);
        setError('Failed to load more properties');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Property Listings
            </h1>
            <p className="text-gray-600">
              Discover your perfect home from our comprehensive property database
            </p>
          </div>
        </div>
      </header>

      {/* Stats Section */}
      {stats && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-lg mx-auto mb-3">
                  <Home className="w-6 h-6 text-primary-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Properties</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mx-auto mb-3">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{stats.available}</div>
                <div className="text-sm text-gray-600">Available</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mx-auto mb-3">
                  <MapPin className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatPrice(stats.averagePrice)}</div>
                <div className="text-sm text-gray-600">Average Price</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mx-auto mb-3">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {Object.keys(stats.propertyTypes || {}).length}
                </div>
                <div className="text-sm text-gray-600">Property Types</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <SearchFilters
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        filters={filters}
        loading={loading}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="text-red-800">{error}</div>
          </div>
        )}

        {loading && properties.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading properties...</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12">
            <Home className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No properties found</h3>
            <p className="text-gray-600">Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <>
            {/* Results Count */}
            <div className="mb-6">
              <p className="text-gray-600">
                Showing {properties.length} of {pagination.total || 0} properties
              </p>
            </div>

            {/* Property Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {properties.map((property) => (
                <PropertyCard key={property.ListingKey} property={property} />
              ))}
            </div>

            {/* Load More Button */}
            {pagination.hasNextPage && (
              <div className="text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="btn btn-primary px-8 py-3"
                >
                  {loading ? 'Loading...' : 'Load More Properties'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600">
            <p>&copy; 2024 Property Listings. Built with Next.js and Tailwind CSS.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
