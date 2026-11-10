"use client"

import React from "react"
import { LucideIcon } from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface SeparatorSectionProps {
  icon?: LucideIcon
  title: string
  description?: string
  className?: string
}

export function SeparatorSection({ 
  icon: Icon, 
  title, 
  description,
  className = ""
}: SeparatorSectionProps) {
  return (
    <div className={`relative ${className}`}>
      <Separator className="my-8" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
