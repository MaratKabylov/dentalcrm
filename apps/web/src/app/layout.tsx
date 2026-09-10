import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dental SaaS — Облачная платформа управления стоматологической клиникой',
  description:
    'Многотенантная медицинская информационная система (МИС) и CRM для стоматологических клиник Республики Казахстан. Соответствие регламентам РК, неизменяемый аудит, расписание, одонтограмма и финансовый ledger.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
