'use client'

// ─────────────────────────────────────────────────────────────
// Component — PrescriptionForm
// Form to create/upload a new prescription.
// ─────────────────────────────────────────────────────────────
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
import { Textarea } from '@/components/ui/textarea'
import { ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/lib/hooks/use-toast'

interface BranchOption {
  id: string
  name: string
}

interface PrescriptionFormProps {
  branches: BranchOption[]
  defaultBranchId?: string
}

export function PrescriptionForm({
  branches,
  defaultBranchId,
}: PrescriptionFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [branchId, setBranchId] = useState(
    defaultBranchId ?? branches[0]?.id ?? ''
  )
  const [patientName, setPatientName] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [doctorRegNumber, setDoctorRegNumber] = useState('')
  const [prescriptionDate, setPrescriptionDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!patientName.trim()) {
      toast.error('Patient name required', 'Please enter the patient name')
      return
    }

    if (!branchId) {
      toast.error('Branch required', 'Please select a branch')
      return
    }

    setLoading(true)
    try {
      const payload = {
        patientName: patientName.trim(),
        patientAge: patientAge ? Number(patientAge) : undefined,
        patientPhone: patientPhone.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
        doctorRegNumber: doctorRegNumber.trim() || undefined,
        prescriptionDate: prescriptionDate || undefined,
        notes: notes.trim() || undefined,
        branchId,
        images: imageUrl.trim()
          ? [
              {
                fileUrl: imageUrl.trim(),
                fileName: imageUrl.split('/').pop() || 'prescription.jpg',
                fileSize: 1024 * 100,
                mimeType: 'image/jpeg',
              },
            ]
          : [],
      }

      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as {
        success: boolean
        data?: { prescriptionNumber: string }
        error?: { message: string }
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Failed to create prescription')
      }

      toast.success(
        'Prescription Created',
        `Prescription ${json.data?.prescriptionNumber ?? ''} registered.`
      )
      router.push(ROUTES.PRESCRIPTIONS)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create prescription'
      toast.error('Error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>New Prescription</CardTitle>
          <CardDescription>
            Register a patient prescription for verification and dispensing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="branch">Branch *</Label>
              <select
                id="branch"
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={branchId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBranchId(e.target.value)}
                required
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="patientName">Patient Name *</Label>
              <Input
                id="patientName"
                value={patientName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPatientName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="patientAge">Patient Age</Label>
              <Input
                id="patientAge"
                type="number"
                min="0"
                max="150"
                value={patientAge}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPatientAge(e.target.value)}
                placeholder="e.g. 35"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="patientPhone">Patient Phone</Label>
              <Input
                id="patientPhone"
                value={patientPhone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPatientPhone(e.target.value)}
                placeholder="e.g. +919876543210"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="prescriptionDate">Prescription Date</Label>
              <Input
                id="prescriptionDate"
                type="date"
                value={prescriptionDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrescriptionDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="doctorName">Doctor Name</Label>
              <Input
                id="doctorName"
                value={doctorName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDoctorName(e.target.value)}
                placeholder="e.g. Dr. K. Rao"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="doctorRegNumber">Doctor Reg Number</Label>
              <Input
                id="doctorRegNumber"
                value={doctorRegNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDoctorRegNumber(e.target.value)}
                placeholder="e.g. MCI-54321"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="imageUrl">Prescription Scan / Image URL</Label>
              <Input
                id="imageUrl"
                value={imageUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImageUrl(e.target.value)}
                placeholder="https://... or /uploads/prescription.jpg"
              />
              <p className="text-xs text-muted-foreground">
                Enter the URL or path to the scanned prescription image.
              </p>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="notes">Medication / Dosage Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="Prescribed drugs, frequency, duration, or diagnostic notes..."
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Register Prescription'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
