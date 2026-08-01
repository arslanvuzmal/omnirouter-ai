import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'OmniRouter AI — AI operations control plane',
    template: '%s · OmniRouter AI',
  },
  description:
    'One secure control plane for your AI models, applications, routing policies, usage and failures.',
  applicationName: 'OmniRouter AI',
  authors: [{ name: 'Arslan Vuzmal Lone' }],
  creator: 'Arslan Vuzmal Lone',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#070a0f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen bg-base-950 antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
