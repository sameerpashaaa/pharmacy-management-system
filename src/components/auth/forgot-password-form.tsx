'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROUTES } from '@/lib/constants/routes'
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@/lib/validations/auth'

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordInput) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      // Always succeed visually: the endpoint returns the same generic response
      // whether or not the email exists, to prevent account enumeration.
      if (!res.ok && res.status !== 200) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        toast.error(body?.error?.message ?? 'Something went wrong. Please try again.')
        return
      }
      setSubmitted(true)
      toast.success('Check your email for a reset link.')
    } catch (err) {
      toast.error('Could not reach the server. Please try again.')
    }
  }

  if (submitted) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            If an account exists for the email you entered, we have sent a password
            reset link. It is valid for 30 minutes.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center">
          <Button asChild variant="outline">
            <a href={ROUTES.LOGIN}>Back to sign in</a>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl">💊</span>
        </div>
        <CardTitle className="text-2xl font-bold">Forgot password</CardTitle>
        <CardDescription>
          Enter the email associated with your account and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@pharmacare.local"
              autoComplete="email"
              disabled={isSubmitting}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending reset link...
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            Remembered it?{' '}
            <a href={ROUTES.LOGIN} className="text-primary hover:underline">
              Back to sign in
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
