import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infinite Stylus Workspace',
  description: 'Infinite stylus brainstorming canvas with organic handwriting AI assistance, gesture text extraction, and liquid navigation.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Infinite Stylus Workspace',
    description: 'Infinite stylus brainstorming canvas with organic handwriting AI assistance, gesture text extraction, and liquid navigation.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Infinite Stylus Workspace',
    description: 'Infinite stylus brainstorming canvas with organic handwriting AI assistance, gesture text extraction, and liquid navigation.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full w-full select-none overflow-hidden touch-none">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="preload" as="image" href="/icons/dock-main-dark-128.png" />
        <link rel="preload" as="image" href="/icons/ai-assistant-white-64.png" />
        <link rel="preload" as="image" href="/icons/ai-assistant-64.png" />
        <link rel="preload" as="image" href="/icons/dock-middle-64.png" />
        <link rel="preload" as="image" href="/icons/back-online-48.png" />
        <link rel="preload" as="image" href="/icons/back-online-white.png" />
      </head>
      <body suppressHydrationWarning className="h-full w-full bg-[#FAF9F6] text-[#1E1E1E] antialiased overflow-hidden m-0 p-0 overscroll-none font-sans">
        {children}
      </body>
    </html>
  );
}


