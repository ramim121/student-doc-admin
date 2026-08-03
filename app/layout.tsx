import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'STUDYDOCK Admin Dashboard',
  description: 'Restricted administration for STUDYDOCK curation and moderation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#090d16] text-slate-100">{children}</body>
    </html>
  );
}
