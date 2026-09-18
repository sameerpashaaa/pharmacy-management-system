'use client'

import { Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'

export function MfaEnrollmentCard() {
  const { data: session } = useSession()
  const toast = useToast()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOwner = session?.user?.roles?.includes('owner') ?? false
  if (!isOwner) return null

  async function startSetup() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' })
      const json = (await res.json()) as {
        success: boolean
        data?: { otpauthUrl: string; qrDataUrl: string }
        error?: { message?: string }
      }
      if (res.ok && json.success && json.data) {
        setQrDataUrl(json.data.qrDataUrl)
        setCode('')
      } else {
        setError(json.error?.message ?? 'Failed to start MFA setup.')
      }
    } catch {
      setError('Failed to start MFA setup.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message?: string } }
      if (res.ok && json.success) {
        setEnabled(true)
        setQrDataUrl(null)
        toast.success('Two-factor authentication enabled.')
      } else {
        setError(json.error?.message ?? 'Verification failed.')
      }
    } catch {
      setError('Verification failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>
          {enabled
            ? 'MFA is enabled for your account.'
            : 'Protect Owner accounts with an authenticator app (TOTP).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <p className="text-sm text-muted-foreground">
            Authenticator codes are required at every sign in.
          </p>
        ) : qrDataUrl ? (
          <form onSubmit={confirmSetup} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with Google Authenticator, then enter the 6-digit code to finish
              setup.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="MFA QR code" className="h-48 w-48 rounded border" />
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Authenticator Code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                disabled={busy}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify & Enable
            </Button>
          </form>
        ) : (
          <>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={startSetup} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable MFA
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
