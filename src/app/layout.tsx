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
