import './globals.css'

export const metadata = {
  title: 'Property Listings - Real Estate Database',
  description: 'Browse and search through comprehensive property listings with advanced filtering and modern UI.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
