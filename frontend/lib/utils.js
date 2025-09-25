import { clsx } from 'clsx';

export function cn(...inputs) {
  return clsx(inputs);
}

export function formatPrice(price) {
  if (!price) return 'Price not available';
  
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(dateString) {
  if (!dateString) return 'Date not available';
  
  return new Date(dateString).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateString) {
  if (!dateString) return 'Date not available';
  
  return new Date(dateString).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncateText(text, maxLength = 150) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function getPropertyStatusColor(status) {
  const statusColors = {
    'Active': 'bg-green-100 text-green-800',
    'Sold': 'bg-blue-100 text-blue-800',
    'Pending': 'bg-yellow-100 text-yellow-800',
    'Withdrawn': 'bg-gray-100 text-gray-800',
    'Expired': 'bg-red-100 text-red-800',
    'Cancelled': 'bg-red-100 text-red-800',
  };
  
  return statusColors[status] || 'bg-gray-100 text-gray-800';
}

export function getPropertyTypeIcon(propertyType) {
  const typeIcons = {
    'Residential': '🏠',
    'Condo': '🏢',
    'Townhouse': '🏘️',
    'Commercial': '🏪',
    'Land': '🌱',
    'Farm': '🚜',
  };
  
  return typeIcons[propertyType] || '🏠';
}
