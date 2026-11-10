"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CreditCard, Wallet, TestTube } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentMethod = "vnpay" | "momo" | "mock";

interface PaymentMethodSelectorProps {
  value?: PaymentMethod;
  onChange?: (method: PaymentMethod) => void;
  className?: string;
}

const paymentMethods = [
  {
    id: "vnpay" as PaymentMethod,
    name: "VNPay",
    description: "Thanh toán qua VNPay (Sandbox)",
    icon: CreditCard,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    id: "momo" as PaymentMethod,
    name: "MoMo",
    description: "Thanh toán qua ví MoMo (Sandbox)",
    icon: Wallet,
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
  },
  {
    id: "mock" as PaymentMethod,
    name: "Thanh toán mô phỏng",
    description: "Dành cho trình diễn/kiểm thử — xác nhận tự động sau 2 giây",
    icon: TestTube,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
];

export function PaymentMethodSelector({
  value,
  onChange,
  className,
}: PaymentMethodSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    value || "mock"
  );

  // Load saved preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("preferredPaymentMethod") as PaymentMethod;
    if (saved && !value) {
      setSelectedMethod(saved);
    }
  }, [value]);

  const handleChange = (method: PaymentMethod) => {
    setSelectedMethod(method);
    localStorage.setItem("preferredPaymentMethod", method);
    onChange?.(method);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-lg font-semibold mb-2">Phương thức thanh toán</h3>
        <p className="text-sm text-muted-foreground">
          Chọn cách thức bạn muốn thanh toán
        </p>
      </div>

      <RadioGroup value={selectedMethod} onValueChange={handleChange}>
        <div className="grid gap-3">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            const isSelected = selectedMethod === method.id;

            return (
              <Card
                key={method.id}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  isSelected && "ring-2 ring-primary shadow-md",
                  method.borderColor
                )}
                onClick={() => handleChange(method.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <RadioGroupItem
                      value={method.id}
                      id={method.id}
                      className="flex-shrink-0"
                    />
                    
                    <div
                      className={cn(
                        "flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0",
                        method.bgColor
                      )}
                    >
                      <Icon className={cn("w-6 h-6", method.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={method.id}
                        className="text-base font-semibold cursor-pointer"
                      >
                        {method.name}
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {method.description}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-primary-foreground"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M5 13l4 4L19 7"></path>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>

      {selectedMethod === "mock" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            ⚠️ Mock Payment sẽ tự động hoàn thành thanh toán mà không cần thực hiện giao dịch thật.
            Chỉ dùng cho mục đích kiểm thử.
          </p>
        </div>
      )}
    </div>
  );
}
