
import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from '@/components/theme-provider';
import { Cairo } from 'next/font/google';
import { FirebaseClientProvider } from '@/firebase';

export const metadata: Metadata = {
  title: 'نبض الملاعب',
  description: 'عالم كرة القدم بين يديك',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#18181b',
};

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-cairo',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png"></link>
      </head>
        <body className={`${cairo.variable} font-body antialiased`}>
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
                themes={['light', 'dark']}
            >
              <FirebaseClientProvider>
                {children}
              </FirebaseClientProvider>
              <Toaster />
            </ThemeProvider>
        </body>
    </html>
  );
}
