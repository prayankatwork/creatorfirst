import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CreatorFirst - Watch together. React together. Keep creators first.',
  description:
    'A synchronized YouTube watch-and-react platform that keeps original creators at the center. Watch and discuss videos together through YouTube\'s official player.',
  keywords: ['youtube', 'watch party', 'reaction', 'synchronized viewing', 'creator-first'],
  openGraph: {
    title: 'CreatorFirst',
    description: 'Watch together. React together. Keep creators first.',
    type: 'website',
    siteName: 'CreatorFirst',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CreatorFirst',
    description: 'Watch together. React together. Keep creators first.',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-950 text-surface-100 antialiased">
        {children}
      </body>
    </html>
  );
}
