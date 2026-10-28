"use client"

import { Button } from "@/components/ui/button"
import { MapPin } from "lucide-react"
import type { Cinema } from "@/lib/api/types"

interface CinemaSelectorProps {
  cinemas: Cinema[]
  selectedCinema: number | null
  onCinemaChange: (cinemaId: number | null) => void
}

export function CinemaSelector({ cinemas, selectedCinema, onCinemaChange }: CinemaSelectorProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Chọn rạp</h3>

      <div className="flex flex-wrap gap-3">
        <Button
          variant={selectedCinema === null ? "default" : "outline"}
          onClick={() => onCinemaChange(null)}
          className="flex items-center gap-2"
        >
          <MapPin className="h-4 w-4" />
          Tất cả rạp
        </Button>

        {cinemas.map((cinema) => (
          <Button
            key={cinema.id}
            variant={selectedCinema === cinema.id ? "default" : "outline"}
            onClick={() => onCinemaChange(cinema.id)}
            className="flex items-center gap-2"
          >
            <MapPin className="h-4 w-4" />
            {cinema.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
