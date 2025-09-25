'use client';

import { useState } from 'react';
import { MapPin, Bed, Bath, Car, Calendar, Eye, ExternalLink } from 'lucide-react';
import { formatPrice, formatDate, truncateText, getPropertyStatusColor, getPropertyTypeIcon } from '../lib/utils';

export default function PropertyCard({ property }) {
  const [imageError, setImageError] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  if (!property) return null;

  const {
    ListingKey,
    UnparsedAddress,
    City,
    StateOrProvince,
    PostalCode,
    ListPrice,
    PropertyType,
    PropertySubType,
    MlsStatus,
    BedroomsAboveGrade,
    BathroomsTotalInteger,
    ParkingTotal,
    PublicRemarks,
    ModificationTimestamp,
    ArchitecturalStyle,
    InteriorFeatures,
    ExteriorFeatures,
  } = property;

  const address = UnparsedAddress || `${City}, ${StateOrProvince} ${PostalCode}`;
  const description = PublicRemarks || 'No description available';
  const features = [...(InteriorFeatures || []), ...(ExteriorFeatures || [])].slice(0, 3);

  return (
    <div className="card hover:shadow-lg transition-shadow duration-300">
      {/* Image Section */}
      <div className="relative h-48 bg-gray-200 overflow-hidden">
        {!imageError ? (
          <img
            src={`https://via.placeholder.com/400x300/3b82f6/ffffff?text=${encodeURIComponent(PropertyType || 'Property')}`}
            alt={address}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
            <div className="text-center">
              <div className="text-4xl mb-2">{getPropertyTypeIcon(PropertyType)}</div>
              <div className="text-primary-600 font-medium">{PropertyType || 'Property'}</div>
            </div>
          </div>
        )}
        
        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPropertyStatusColor(MlsStatus)}`}>
            {MlsStatus || 'Unknown'}
          </span>
        </div>

        {/* Price Badge */}
        <div className="absolute top-3 right-3">
          <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-lg">
            <div className="text-lg font-bold text-gray-900">{formatPrice(ListPrice)}</div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4">
        {/* Address */}
        <div className="flex items-start gap-2 mb-3">
          <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900 line-clamp-2">{address}</h3>
            {PropertySubType && (
              <p className="text-sm text-gray-600">{PropertySubType}</p>
            )}
          </div>
        </div>

        {/* Property Details */}
        <div className="flex items-center gap-4 mb-3 text-sm text-gray-600">
          {BedroomsAboveGrade && (
            <div className="flex items-center gap-1">
              <Bed className="w-4 h-4" />
              <span>{BedroomsAboveGrade} bed{BedroomsAboveGrade !== 1 ? 's' : ''}</span>
            </div>
          )}
          {BathroomsTotalInteger && (
            <div className="flex items-center gap-1">
              <Bath className="w-4 h-4" />
              <span>{BathroomsTotalInteger} bath{BathroomsTotalInteger !== 1 ? 's' : ''}</span>
            </div>
          )}
          {ParkingTotal && (
            <div className="flex items-center gap-1">
              <Car className="w-4 h-4" />
              <span>{ParkingTotal} parking</span>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="mb-3">
          <p className="text-sm text-gray-700 leading-relaxed">
            {showFullDescription ? description : truncateText(description, 120)}
          </p>
          {description.length > 120 && (
            <button
              onClick={() => setShowFullDescription(!showFullDescription)}
              className="text-primary-600 text-sm font-medium hover:text-primary-700 mt-1"
            >
              {showFullDescription ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Features */}
        {features.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {features.map((feature, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Architectural Style */}
        {ArchitecturalStyle && ArchitecturalStyle.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {ArchitecturalStyle.slice(0, 2).map((style, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-md"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>Updated {formatDate(ModificationTimestamp)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <Eye className="w-4 h-4" />
            </button>
            <button className="p-1 text-gray-400 hover:text-primary-600 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
