import type { Metadata } from 'next'
import { Suspense } from 'react'

import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
