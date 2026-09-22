import { MapPin } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

interface LocationBadgeProps {
  wall?: string
  rack?: string
  shelf?: number
  bin?: string
  fullAddress?: string
  className?: string
}

export function LocationBadge({ wall, rack, shelf, bin, fullAddress, className }: LocationBadgeProps) {
  if (fullAddress) {
    return (
      <Badge variant="outline" className={`flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 ${className}`}>
        <MapPin className="h-3 w-3" />
        {fullAddress}
      </Badge>
    )
  }
  
  if (!wall && !rack && !bin) return null
  
  return (
    <Badge variant="outline" className={`flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 ${className}`}>
      <MapPin className="h-3 w-3" />
      {[wall, rack, shelf ? `S${shelf}` : null, bin].filter(Boolean).join('-')}
    </Badge>
  )
}
