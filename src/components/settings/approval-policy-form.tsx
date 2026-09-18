'use client'
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'

export function ApprovalPolicyForm() {
  const toast = useToast()
  const [selfMax, setSelfMax] = useState<string>('10')
  const [managerMax, setManagerMax] = useState<string>('50')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(true)

  useEffect(() => {
    fetch('/api/settings/approval-policy')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setSelfMax(String(d.data.selfMax))
          setManagerMax(String(d.data.managerMax))
        } else if (
          d.error?.message?.includes('Forbidden') ||
          d.error?.message?.includes('Unauthorized')
        ) {
          setCanEdit(false)
        }
      })
      .catch(() => setError('Failed to load policy'))
      .finally(() => setLoading(false))
  }, [])

  const s = Number(selfMax)
  const m = Number(managerMax)
  const valid = Number.isInteger(s) && s >= 0 && Number.isInteger(m) && m > s

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setError('Validation: selfMax >=0 and managerMax > selfMax, integers only')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/approval-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfMax: s, managerMax: m }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: { message?: string }
        message?: string
      }
      if (res.ok && json.success) {
        toast.success('Approval policy updated')
      } else {
        setError(json.error?.message ?? 'Failed to update policy')
      }
    } catch {
      setError('Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading policy…</p>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Approval Policy</CardTitle>
        <CardDescription>
          Configure quantity thresholds for stock adjustment approvals. Changes are audited.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="selfMax">Pharmacist self-approval maximum</Label>
              <Input
                id="selfMax"
                type="number"
                min={0}
                step={1}
                value={selfMax}
                onChange={(e) => setSelfMax(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="managerMax">Pharmacy Manager maximum</Label>
              <Input
                id="managerMax"
                type="number"
                min={1}
                step={1}
                value={managerMax}
                onChange={(e) => setManagerMax(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Result:</p>
            <p>0–{Number.isFinite(s) ? s : '?'} → Pharmacist self-approval</p>
            <p>
              {Number.isFinite(s) ? s + 1 : '?'}–{Number.isFinite(m) ? m : '?'} → Pharmacy Manager
            </p>
            <p>{Number.isFinite(m) ? m + 1 : '?'}+ → Chief Pharmacist + evidence</p>
          </div>

          {!valid && (
            <p className="text-sm text-destructive">
              Invalid: managerMax must be integer &gt; selfMax, selfMax ≥0
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              You do not have permission to edit this policy (requires settings:manage).
            </p>
          )}

          <Button type="submit" disabled={saving || !valid || !canEdit}>
            {saving ? 'Saving…' : 'Save Policy'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
