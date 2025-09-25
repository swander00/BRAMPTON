# Property Listings Frontend

A modern Next.js frontend application for browsing and searching property listings from your real estate backend API.

## Features

- 🏠 **Property Cards**: Beautiful, responsive property cards with images, details, and features
- 🔍 **Advanced Search**: Search by address, city, postal code with real-time filtering
- 🎛️ **Smart Filters**: Filter by price range, property type, bedrooms, bathrooms, and status
- 📊 **Statistics Dashboard**: View property statistics and market insights
- 📱 **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- ⚡ **Fast Performance**: Optimized with Next.js and Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ 
- Your backend API running on `http://localhost:3001` (or configure the URL)

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp env.example .env.local
   ```
   
   Edit `.env.local` and set your backend URL:
   ```
   NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Integration

The frontend connects to your backend API endpoints:

- `GET /api/properties` - Fetch properties with pagination and filtering
- `GET /api/properties/search` - Advanced property search
- `GET /api/properties/stats` - Property statistics
- `GET /api/properties/:listingKey` - Get single property details
- `GET /api/properties/:listingKey/media` - Get property media

## Components

### PropertyCard
Displays individual property information including:
- Property image (with fallback)
- Address and property type
- Price and status
- Bedrooms, bathrooms, parking
- Description and features
- Last updated timestamp

### SearchFilters
Provides search and filtering functionality:
- Text search by address/city
- Property type filtering
- Price range filtering
- Bedroom/bathroom filtering
- Status filtering
- Sort options

## Styling

Built with Tailwind CSS for modern, responsive design:
- Custom color scheme with primary blue theme
- Responsive grid layouts
- Hover effects and transitions
- Mobile-first design approach

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Project Structure

```
frontend/
├── app/                 # Next.js app directory
│   ├── globals.css     # Global styles
│   ├── layout.jsx      # Root layout
│   └── page.jsx        # Home page
├── components/         # React components
│   ├── PropertyCard.jsx
│   └── SearchFilters.jsx
├── lib/               # Utility functions
│   ├── api.js         # API client
│   └── utils.js       # Helper functions
└── public/            # Static assets
```

## Customization

### Adding New Filters
Edit `SearchFilters.jsx` to add new filter options and update the API calls accordingly.

### Styling Changes
Modify `tailwind.config.js` for theme customization or edit `globals.css` for custom styles.

### API Integration
Update `lib/api.js` to add new API endpoints or modify existing ones.

## Troubleshooting

### Common Issues

1. **API Connection Errors**: Ensure your backend is running and the `NEXT_PUBLIC_BACKEND_URL` is correct.

2. **CORS Issues**: Make sure your backend has CORS configured to allow requests from `http://localhost:3000`.

3. **No Properties Showing**: Check that your backend has data and the API endpoints are working correctly.

### Debug Mode

Enable debug logging by opening browser developer tools and checking the console for API request/response logs.

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

3. Configure your production backend URL in environment variables.

## License

MIT License - feel free to use and modify as needed.
