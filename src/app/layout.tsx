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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof navigator !== 'undefined' && navigator.userAgent.includes('FluxbaseDesktop')) {
                const style = document.createElement('style');
                style.innerHTML = \`
                  html {
                    transform: scale(0.8) !important;
                    transform-origin: top left !important;
                    width: 125% !important;
                    height: 125% !important;
                    max-width: none !important;
                    max-height: none !important;
                  }
                  body {
                    width: 100% !important;
                    max-width: none !important;
                    min-height: 100% !important;
                  }
                  .min-h-screen {
                    min-height: 100% !important;
                  }
                  .h-screen {
                    height: 100% !important;
                  }
                \`;
                document.head.appendChild(style);
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
