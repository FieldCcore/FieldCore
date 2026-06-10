import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FieldCore™ — The operating system for service businesses',
  description: 'Schedule, invoice, communicate, and grow — all in one platform.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-offwhite text-navy antialiased">{children}</body>
    </html>
  )
}
