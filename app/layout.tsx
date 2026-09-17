import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Домашка — семейный дневник', description: 'Расписание и домашние задания для всей семьи.', manifest: '/manifest.webmanifest' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
 return <html lang="ru"><body>{children}</body></html>;
}
