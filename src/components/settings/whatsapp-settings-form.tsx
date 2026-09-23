'use client'

// ─────────────────────────────────────────────────────────────
// Component — WhatsAppSettingsForm
//
// Settings form for Meta Cloud API WhatsApp integration.
// Credentials are saved to organization_settings via /api/eod/settings.
// Test button calls /api/eod/send to send an immediate report.
// ─────────────────────────────────────────────────────────────
import { Eye, EyeOff, Send, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'

interface WhatsAppSettings {
  phoneNumberId: string
  accessToken: string
  wabaId: string
  apiVersion: string
  eodEnabled: boolean
  ownerPhone: string
  orgName: string
}

type TestStatus = 'idle' | 'sending' | 'success' | 'error'

export function WhatsAppSettingsForm() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [testPreview, setTestPreview] = useState<string | null>(null)

  const [settings, setSettings] = useState<WhatsAppSettings>({
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    apiVersion: 'v19.0',
    eodEnabled: true,
    ownerPhone: '',
    orgName: '',
  })

  useEffect(() => {
    fetch('/api/eod/settings')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: WhatsAppSettings }) => {
        if (d.success && d.data) {
          setSettings(d.data)
        }
      })
      .catch(() => toast.error('Failed to load WhatsApp settings'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(field: keyof WhatsAppSettings, value: string | boolean) {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/eod/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: settings.phoneNumberId,
          accessToken: settings.accessToken,
          wabaId: settings.wabaId,
          apiVersion: settings.apiVersion || 'v19.0',
          eodEnabled: settings.eodEnabled,
          ownerPhone: settings.ownerPhone,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (res.ok && json.success) {
        toast.success('WhatsApp settings saved successfully')
      } else {
        toast.error(json.error ?? 'Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestSend() {
    setTestStatus('sending')
    setTestError(null)
    setTestPreview(null)

    try {
      const res = await fetch('/api/eod/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: settings.phoneNumberId,
          accessToken: settings.accessToken,
          wabaId: settings.wabaId,
          apiVersion: settings.apiVersion || 'v19.0',
          ownerPhone: settings.ownerPhone,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        preview?: string
        recipient?: string
      }

      if (res.ok && json.success) {
        setTestStatus('success')
        setTestPreview(json.preview ?? null)
        toast.success(`Test report sent to ${json.recipient ?? settings.ownerPhone}!`)
      } else {
        setTestStatus('error')
        setTestError(json.error ?? 'Unknown error')
        toast.error(json.error ?? 'Failed to send test report')
      }
    } catch (err) {
      setTestStatus('error')
      const msg = err instanceof Error ? err.message : 'Network error'
      setTestError(msg)
      toast.error(msg)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading WhatsApp settings…
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* ── Section 1: Meta API Credentials ─────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🔌</span> Meta Cloud API Credentials
          </CardTitle>
          <CardDescription>
            Get these from{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:no-underline"
            >
              Meta Developer Console <ExternalLink className="h-3 w-3" />
            </a>{' '}
            → Your App → WhatsApp → API Setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Phone Number ID */}
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumberId">
                Phone Number ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phoneNumberId"
                placeholder="e.g. 1330061263522700"
                value={settings.phoneNumberId}
                onChange={(e) => handleChange('phoneNumberId', e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The numeric ID of your WhatsApp sender phone number
              </p>
            </div>

            {/* WABA ID */}
            <div className="space-y-1.5">
              <Label htmlFor="wabaId">
                WhatsApp Business Account ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wabaId"
                placeholder="e.g. 4471213543142707"
                value={settings.wabaId}
                onChange={(e) => handleChange('wabaId', e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Your WhatsApp Business Account (WABA) ID
              </p>
            </div>

            {/* Access Token */}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="accessToken">
                Access Token <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="accessToken"
                  type={showToken ? 'text' : 'password'}
                  placeholder="EAAxxxxxxxxxxxxxxx…"
                  value={settings.accessToken}
                  onChange={(e) => handleChange('accessToken', e.target.value)}
                  className="pr-10 font-mono text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Permanent or temporary Meta API access token. Keep this secret — stored encrypted in
                your database.
              </p>
            </div>

            {/* API Version */}
            <div className="space-y-1.5">
              <Label htmlFor="apiVersion">API Version</Label>
              <Input
                id="apiVersion"
                placeholder="v19.0"
                value={settings.apiVersion}
                onChange={(e) => handleChange('apiVersion', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Meta Graph API version (default: v19.0)
              </p>
            </div>

            {/* EOD Enabled Toggle */}
            <div className="space-y-1.5">
              <Label htmlFor="eodEnabled">EOD Report Status</Label>
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <button
                  id="eodEnabled"
                  type="button"
                  role="switch"
                  aria-checked={settings.eodEnabled}
                  onClick={() => handleChange('eodEnabled', !settings.eodEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    settings.eodEnabled ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                      settings.eodEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {settings.eodEnabled ? '✅ Enabled — Report fires at 8:00 PM IST' : '⏸ Disabled'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Recipient Info ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📱</span> Recipient & Schedule
          </CardTitle>
          <CardDescription>
            The report is sent to your organization&apos;s registered phone number
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ownerPhone">
                Owner WhatsApp Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ownerPhone"
                placeholder="e.g. +919876543210 or +15551685761"
                value={settings.ownerPhone}
                onChange={(e) => handleChange('ownerPhone', e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Phone number with country code (e.g. <code>+91</code> for India, <code>+1</code> for
                US test number).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Report Time</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">🕗 8:00 PM IST (20:00 Asia/Kolkata)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Scheduled by the local cron runner. Run{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs">npm run cron:eod</code> to
                activate.
              </p>
            </div>
          </div>

          {/* Info box about Meta test number */}
          {settings.ownerPhone && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                ⚠️ Meta Test Mode Notice
              </p>
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                If using the Meta sandbox (test phone number), you must add{' '}
                <strong>{settings.ownerPhone}</strong> as a verified recipient in the Meta Developer
                Console under WhatsApp → API Setup → &quot;To&quot; number.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Test Button ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🧪</span> Test Report
          </CardTitle>
          <CardDescription>
            Send today&apos;s report immediately to verify your configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestSend}
              disabled={testStatus === 'sending'}
              className="gap-2"
            >
              {testStatus === 'sending' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Test Report Now
                </>
              )}
            </Button>

            {testStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Sent successfully!
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                {testError}
              </div>
            )}
          </div>

          {/* Message preview */}
          {testPreview && (
            <div className="space-y-1.5">
              <Label>Message Preview</Label>
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-sans text-xs leading-relaxed">
                {testPreview}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Save Button ──────────────────────────────────────── */}
      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save WhatsApp Settings'
          )}
        </Button>
      </div>
    </form>
  )
}
