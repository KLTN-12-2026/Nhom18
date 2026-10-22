"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { submitRating } from "@/lib/api/reviews";

interface StarRatingProps {
  movieId: number;
  initialRating?: number;
  initialUserRating?: number;
  ratingCount?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  showCount?: boolean;
  onRatingChange?: (newRating: number) => void;
}

export function StarRating({
  movieId,
  initialRating = 0,
  initialUserRating = 0,
  ratingCount = 0,
  size = "md",
  interactive = false,
  showCount = true,
  onRatingChange,
}: StarRatingProps) {
  const [averageRating, setAverageRating] = useState(initialRating);
  const [userRating, setUserRating] = useState(initialUserRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [count, setCount] = useState(ratingCount);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const handleRatingClick = async (rating: number) => {
    if (!interactive || isSubmitting) return;

    const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Vui lòng đăng nhập để đánh giá");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitRating(movieId, rating);
      setUserRating(rating);
      setAverageRating(data.averageRating);
      setCount(data.ratingCount);
      
      toast.success(`Đã đánh giá ${rating} sao`);
      
      if (onRatingChange) {
        onRatingChange(data.averageRating);
      }
    } catch (error) {
      console.error("Rating error:", error);
      // Hiện ĐÚNG lý do backend trả về thay vì nuốt mất rồi báo chung chung —
      // quan trọng nhất là trường hợp 403 "cần đặt vé và thanh toán cho phim
      // này trước khi chấm sao": nếu chỉ báo "Không thể gửi đánh giá" thì người
      // dùng không hiểu vì sao bấm mãi không được.
      const message = error instanceof Error && error.message ? error.message : "Không thể gửi đánh giá";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = interactive
    ? hoverRating || userRating
    : averageRating;

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          "flex items-center",
          interactive && "cursor-pointer"
        )}
        onMouseLeave={() => interactive && setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= Math.round(displayRating);
          const isPartial =
            !interactive &&
            star > Math.floor(displayRating) &&
            star <= Math.ceil(displayRating);

          return (
            <div
              key={star}
              className={cn(
                "relative",
                interactive && "transition-transform hover:scale-110"
              )}
              onMouseEnter={() => interactive && setHoverRating(star)}
              onClick={() => handleRatingClick(star)}
            >
              <Star
                className={cn(
                  sizeClasses[size],
                  "transition-colors",
                  isFilled
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-none text-gray-300"
                )}
              />
              {isPartial && (
                <Star
                  className={cn(
                    sizeClasses[size],
                    "absolute left-0 top-0 fill-yellow-400 text-yellow-400"
                  )}
                  style={{
                    clipPath: `inset(0 ${100 - (displayRating % 1) * 100}% 0 0)`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {showCount && (
        <span className="text-xs text-muted-foreground ml-1">
          {Number(averageRating).toFixed(1)}
          {count > 0 && ` (${count})`}
        </span>
      )}
    </div>
  );
}
