import DatabaseService from '../services/databaseService.js';
import SyncService from '../services/syncService.js';
import logger from '../utils/logger.js';

class PropertyController {
  constructor() {
    this.database = new DatabaseService();
    this.syncService = new SyncService();
  }

  /**
   * Get properties with pagination and filtering
   */
  async getProperties(req, res) {
    try {
      const {
        page = 1,
        limit = 50,
        sortBy = 'ModificationTimestamp',
        sortOrder = 'desc',
        ...filters
      } = req.query;

      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 per page

      const options = {
        page: pageNum,
        limit: limitNum,
        sortBy,
        sortOrder,
        filters: this.buildFilters(filters)
      };

      const result = await this.database.getProperties(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });

    } catch (error) {
      logger.error('Error in getProperties controller', { 
        error: error.message,
        query: req.query
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get a single property by ListingKey
   */
  async getProperty(req, res) {
    try {
      const { listingKey } = req.params;

      if (!listingKey) {
        return res.status(400).json({
          success: false,
          error: 'ListingKey is required'
        });
      }

      const { data, error } = await this.database.client
        .from('Property')
        .select('*')
        .eq('ListingKey', listingKey)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: 'Property not found'
          });
        }
        throw error;
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      logger.error('Error in getProperty controller', { 
        error: error.message,
        listingKey: req.params.listingKey
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get media for a specific property
   */
  async getPropertyMedia(req, res) {
    try {
      const { listingKey } = req.params;
      const { mediaType, preferredOnly } = req.query;

      if (!listingKey) {
        return res.status(400).json({
          success: false,
          error: 'ListingKey is required'
        });
      }

      const options = {
        mediaType: mediaType || null,
        preferredOnly: preferredOnly === 'true'
      };

      const media = await this.database.getMediaForProperty(listingKey, options);

      res.json({
        success: true,
        data: media,
        count: media.length
      });

    } catch (error) {
      logger.error('Error in getPropertyMedia controller', { 
        error: error.message,
        listingKey: req.params.listingKey
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Search properties with advanced filters
   */
  async searchProperties(req, res) {
    try {
      const {
        query: searchQuery,
        city,
        minPrice,
        maxPrice,
        propertyType,
        bedrooms,
        bathrooms,
        page = 1,
        limit = 50,
        sortBy = 'ModificationTimestamp',
        sortOrder = 'desc'
      } = req.query;

      const filters = {};

      // Build search filters
      if (city) {
        filters.City = `%${city}%`; // ILIKE search
      }

      if (minPrice) {
        const minPriceNum = parseFloat(minPrice);
        if (!isNaN(minPriceNum)) {
          filters.ListPrice = { gte: minPriceNum };
        }
      }

      if (maxPrice) {
        const maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(maxPriceNum)) {
          filters.ListPrice = { ...filters.ListPrice, lte: maxPriceNum };
        }
      }

      if (propertyType) {
        filters.PropertyType = propertyType;
      }

      if (bedrooms) {
        const bedroomsNum = parseInt(bedrooms);
        if (!isNaN(bedroomsNum)) {
          filters.BedroomsAboveGrade = bedroomsNum;
        }
      }

      if (bathrooms) {
        const bathroomsNum = parseInt(bathrooms);
        if (!isNaN(bathroomsNum)) {
          filters.BathroomsTotalInteger = bathroomsNum;
        }
      }

      const options = {
        page: Math.max(1, parseInt(page)),
        limit: Math.min(100, Math.max(1, parseInt(limit))),
        sortBy,
        sortOrder,
        filters
      };

      const result = await this.database.getProperties(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        searchCriteria: filters
      });

    } catch (error) {
      logger.error('Error in searchProperties controller', { 
        error: error.message,
        query: req.query
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Sync a specific property
   */
  async syncProperty(req, res) {
    try {
      const { listingKey } = req.params;

      if (!listingKey) {
        return res.status(400).json({
          success: false,
          error: 'ListingKey is required'
        });
      }

      const result = await this.syncService.syncSingleProperty(listingKey);

      res.json({
        success: true,
        data: result,
        message: `Property ${listingKey} synced successfully`
      });

    } catch (error) {
      logger.error('Error in syncProperty controller', { 
        error: error.message,
        listingKey: req.params.listingKey
      });
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Property not found'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get property statistics
   */
  async getPropertyStats(req, res) {
    try {
      const { data: totalCount } = await this.database.client
        .from('Property')
        .select('*', { count: 'exact', head: true });

      const { data: availableCount } = await this.database.client
        .from('Property')
        .select('*', { count: 'exact', head: true })
        .eq('MlsStatus', 'Active');

      const { data: avgPrice } = await this.database.client
        .from('Property')
        .select('ListPrice')
        .not('ListPrice', 'is', null);

      // Calculate average price
      let averagePrice = 0;
      if (avgPrice && avgPrice.length > 0) {
        const sum = avgPrice.reduce((acc, prop) => acc + (prop.ListPrice || 0), 0);
        averagePrice = Math.round(sum / avgPrice.length);
      }

      // Get property type distribution
      const { data: typeDistribution } = await this.database.client
        .from('Property')
        .select('PropertyType')
        .not('PropertyType', 'is', null);

      const typeStats = {};
      typeDistribution?.forEach(prop => {
        typeStats[prop.PropertyType] = (typeStats[prop.PropertyType] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          total: totalCount || 0,
          available: availableCount || 0,
          averagePrice,
          propertyTypes: typeStats
        }
      });

    } catch (error) {
      logger.error('Error in getPropertyStats controller', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Build filters object from query parameters
   * @private
   */
  buildFilters(queryFilters) {
    const filters = {};
    
    // Define allowed filter fields and their types
    const allowedFilters = {
      MlsStatus: 'string',
      ContractStatus: 'string',
      StandardStatus: 'string',
      PropertyType: 'string',
      PropertySubType: 'string',
      City: 'string',
      StateOrProvince: 'string',
      PostalCode: 'string',
      ListPrice: 'number',
      BedroomsAboveGrade: 'number',
      BathroomsTotalInteger: 'number'
    };

    Object.entries(queryFilters).forEach(([key, value]) => {
      if (allowedFilters[key] && value !== undefined && value !== '') {
        if (allowedFilters[key] === 'number') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            filters[key] = numValue;
          }
        } else {
          filters[key] = value;
        }
      }
    });

    return filters;
  }
}

export default PropertyController;
