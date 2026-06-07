import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { GlobalAlertProvider } from "@/components/global-alert-provider";
import { QueryProvider } from "@/components/query-provider";

export const metadata: Metadata = {
  title: 'Fluxbase',
  description: 'The modern, AI-powered spreadsheet and data analysis tool.',
  verification: {
    google: 'JhrAGACmQgsrw96rM9LhMCQBNnDm2AhDLtE6NtVHEfw',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof navigator !== 'undefined' && navigator.userAgent.includes('FluxbaseDesktop')) {
                document.documentElement.style.zoom = '80%';
              }
            `
          }}
        />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
          <QueryProvider>
            <GlobalAlertProvider>
              {children}
              <Toaster />
            </GlobalAlertProvider>
          </QueryProvider>
      </body>
    </html>
  );
}
