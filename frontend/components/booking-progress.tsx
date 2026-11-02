'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BookingProgressProps {
  currentStep: 1 | 2 | 3 | 4
  className?: string
}

const steps = [
  { number: 1, label: 'Chọn ghế', description: 'Lựa chọn vị trí ngồi' },
  { number: 2, label: 'Combo', description: 'Thêm đồ ăn & nước' },
  { number: 3, label: 'Thanh toán', description: 'Xác nhận đặt vé' },
  { number: 4, label: 'Hoàn tất', description: 'Nhận vé điện tử' },
]

export function BookingProgress({ currentStep, className }: BookingProgressProps) {
  return (
    <div className={cn("w-full py-6", className)}>
      {/* Desktop Progress - Horizontal */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {steps.map((step, index) => {
            const isCompleted = currentStep > step.number
            const isCurrent = currentStep === step.number
            const isUpcoming = currentStep < step.number

            return (
              <div key={step.number} className="flex items-center flex-1">
                {/* Step Circle */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center font-semibold transition-all duration-300",
                      isCompleted && "bg-primary text-primary-foreground",
                      isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110",
                      isUpcoming && "bg-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-6 w-6" />
                    ) : (
                      <span>{step.number}</span>
                    )}
                  </div>
                  <div className="mt-3 text-center">
                    <div
                      className={cn(
                        "text-sm font-medium transition-colors",
                        (isCurrent || isCompleted) && "text-foreground",
                        isUpcoming && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </div>
                  </div>
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 mx-4 mb-12">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        isCompleted ? "bg-primary" : "bg-muted"
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile Progress - Vertical Compact */}
      <div className="md:hidden">
        <div className="flex items-center justify-between px-4">
          {steps.map((step, index) => {
            const isCompleted = currentStep > step.number
            const isCurrent = currentStep === step.number
            const isUpcoming = currentStep < step.number

            return (
              <div key={step.number} className="flex flex-col items-center flex-1">
                {/* Step Circle */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    isUpcoming && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>
                
                {/* Step Label - Only show for current */}
                <div className="mt-2 text-center">
                  <div
                    className={cn(
                      "text-xs font-medium",
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </div>
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-0 right-0 h-0.5 -z-10"
                    style={{
                      top: '20px',
                      left: `${(index + 0.5) * 25}%`,
                      width: '25%',
                    }}
                  >
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        isCompleted ? "bg-primary" : "bg-muted"
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Current Step Description */}
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">
            {steps[currentStep - 1].description}
          </p>
        </div>
      </div>
    </div>
  )
}
