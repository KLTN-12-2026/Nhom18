"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { ThumbsUp, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getReviews, submitReview, deleteReview, markReviewHelpful, type Review } from "@/lib/api/reviews";

const SENTIMENT_DISPLAY: Record<string, { text: string; emoji: string; className: string }> = {
  positive: { text: "Tích cực", emoji: "😊", className: "bg-green-500/10 text-green-600 border-green-500/30" },
  neutral: { text: "Trung lập", emoji: "😐", className: "bg-muted text-muted-foreground border-muted-foreground/30" },
  negative: { text: "Tiêu cực", emoji: "😞", className: "bg-red-500/10 text-red-600 border-red-500/30" },
};

interface MovieReviewsProps {
  movieId: number;
}

export function MovieReviews({ movieId }: MovieReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(0);
  // StarRating tự quản lý state chọn sao nội bộ (chỉ đọc initialRating 1 LẦN
  // lúc mount, không tự đồng bộ lại khi prop đổi) — đổi key để ép remount mỗi
  // khi gửi review thành công, nếu không sao vừa chọn vẫn sáng trên UI dù đã
  // gửi xong và state cha đã reset.
  const [ratingResetKey, setRatingResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    fetchReviews();
    // Get current user from token
    const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUserId(payload.id);
      } catch (e) {
        console.error("Parse token error:", e);
      }
    }
  }, [movieId]);

  const fetchReviews = async () => {
    try {
      setReviews(await getReviews(movieId));
    } catch (error) {
      console.error("Fetch reviews error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Vui lòng đăng nhập để viết review");
      return;
    }

    if (reviewText.trim().length < 10) {
      toast.error("Review phải có ít nhất 10 ký tự");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitReview(movieId, { rating: rating || null, review_text: reviewText });

      if (result.moderationStatus === "flagged") {
        toast.warning("Đánh giá đang chờ duyệt", {
          description: "Nội dung của bạn đã được ghi nhận và sẽ hiển thị công khai sau khi quản trị viên duyệt qua.",
        });
      } else if (result.pointsAwarded > 0) {
        toast.success(`✨ Đánh giá đã được đăng! +${result.pointsAwarded} điểm thưởng 🎉`);
      } else {
        toast.success("✨ Đánh giá đã được đăng!");
      }
      setReviewText("");
      setRating(0);
      setRatingResetKey((k) => k + 1);
      fetchReviews();
    } catch (error: any) {
      console.error('Submit review error:', error);
      toast.error(error.message || "Không thể gửi review");
    } finally {
      setSubmitting(false);
    }
  };

  // Lưu ý: backend xoá review CỦA CHÍNH USER ĐANG ĐĂNG NHẬP cho movieId này
  // (không xoá theo reviewId tuỳ ý — xem lib/api/reviews.ts). Hàm này chỉ
  // được gọi từ nút xoá gắn với review của chính user hiện tại (điều kiện
  // review.user_id === currentUserId ở nơi render), nên không cần/nhận
  // reviewId làm tham số.
  const handleDelete = async () => {
    try {
      await deleteReview(movieId);
      toast.success("Review đã xóa");
      fetchReviews();
    } catch (error) {
      toast.error("Không thể xóa review");
    }
  };

  const handleHelpful = async (reviewId: number) => {
    const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Vui lòng đăng nhập");
      return;
    }

    try {
      await markReviewHelpful(reviewId);
      fetchReviews();
    } catch (error) {
      toast.error("Lỗi");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Viết đánh giá của bạn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Đánh giá (tùy chọn)
            </label>
            <StarRating
              key={ratingResetKey}
              movieId={movieId}
              initialUserRating={rating}
              size="lg"
              interactive={true}
              showCount={false}
              onRatingChange={setRating}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Nhận xét của bạn
            </label>
            <Textarea
              placeholder="Chia sẻ cảm nhận của bạn về bộ phim (tối thiểu 10 ký tự)..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || reviewText.trim().length < 10}
            className="w-full sm:w-auto"
          >
            <Send className="w-4 h-4 mr-2" />
            {submitting ? "Đang gửi..." : "Gửi đánh giá"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold">
          Đánh giá từ người xem ({reviews.length})
        </h3>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              Chưa có đánh giá nào. Hãy là người đầu tiên!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Avatar>
                        <AvatarFallback>
                          {review.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{review.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString("vi-VN")}
                            </p>
                          </div>
                          {review.user_id === currentUserId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {review.rating && (
                            <StarRating
                              movieId={movieId}
                              initialRating={review.rating}
                              size="sm"
                              showCount={false}
                            />
                          )}
                          {review.sentiment_label && SENTIMENT_DISPLAY[review.sentiment_label] && (
                            <Badge variant="outline" className={cn("text-xs", SENTIMENT_DISPLAY[review.sentiment_label].className)}>
                              {SENTIMENT_DISPLAY[review.sentiment_label].emoji} {SENTIMENT_DISPLAY[review.sentiment_label].text}
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm leading-relaxed">{review.review_text}</p>

                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleHelpful(review.id)}
                            className="text-muted-foreground"
                          >
                            <ThumbsUp className="w-4 h-4 mr-1" />
                            Hữu ích ({review.helpful_count})
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
