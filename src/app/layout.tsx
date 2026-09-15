import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'

import { SessionProvider } from '@/components/auth/session-provider'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    template: '%s | PharmaCare',
    default: 'PharmaCare — Pharmacy Management System',
  },
  description: 'Complete pharmacy management system for modern pharmacies',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          {children}
          <ConfirmationDialog />
          <Toaster position="top-right" richColors closeButton />
        </SessionProvider>
      </body>
    </html>
  )
}
