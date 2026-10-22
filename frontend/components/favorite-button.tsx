"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { checkFavorite as checkFavoriteApi, addFavorite, removeFavorite } from "@/lib/api/favorites"

interface FavoriteButtonProps {
  movieId: number
  variant?: "default" | "icon"
  className?: string
  /** Gọi lại sau khi bấm thành công (thêm/bỏ yêu thích) — cần thiết cho các
   * trang cha muốn tự cập nhật danh sách của mình (vd trang Yêu thích cần
   * biết để loại phim vừa bỏ khỏi danh sách hiển thị ngay, không phải F5). */
  onToggle?: (isFavorite: boolean) => void
}

export function FavoriteButton({ movieId, variant = "default", className, onToggle }: FavoriteButtonProps) {
  const { user } = useAuth()
  const [isFavorite, setIsFavorite] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user) {
      checkFavorite()
    }
  }, [user, movieId])

  const checkFavorite = async () => {
    try {
      setIsFavorite(await checkFavoriteApi(movieId))
    } catch (error) {
      console.error("Check favorite error:", error)
    }
  }

  const toggleFavorite = async () => {
    if (!user) {
      toast.error("Yêu cầu đăng nhập", {
        description: "Vui lòng đăng nhập để thêm phim yêu thích",
      })
      return
    }

    setIsLoading(true)
    try {
      const data = isFavorite ? await removeFavorite(movieId) : await addFavorite(movieId)

      const nextIsFavorite = !isFavorite
      setIsFavorite(nextIsFavorite)
      onToggle?.(nextIsFavorite)
      if (isFavorite) {
        toast.info("Đã xóa khỏi yêu thích", {
          description: data.message,
        })
      } else {
        toast.success("✨ Đã thêm vào yêu thích", {
          description: data.message,
        })
      }
    } catch (error) {
      console.error("Toggle favorite error:", error)
      toast.error("Lỗi", {
        description: "Không thể cập nhật yêu thích",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleFavorite}
        disabled={isLoading}
        aria-label={isFavorite ? "Xóa khỏi yêu thích" : "Thêm vào yêu thích"}
        className={cn(
          "transition-all hover:scale-110",
          isFavorite && "text-red-500",
          className
        )}
      >
        <motion.div
          animate={isFavorite ? { 
            scale: [1, 1.3, 1],
          } : {}}
          transition={{ duration: 0.3 }}
        >
          <Heart 
            className={cn(
              "h-5 w-5",
              isFavorite && "fill-current"
            )} 
          />
        </motion.div>
      </Button>
    )
  }

  return (
    <Button
      variant={isFavorite ? "default" : "outline"}
      onClick={toggleFavorite}
      disabled={isLoading}
      className={cn(className)}
    >
      <motion.div
        animate={isFavorite ? { 
          scale: [1, 1.2, 1],
        } : {}}
        transition={{ duration: 0.3 }}
        className="inline-flex items-center"
      >
        <Heart 
          className={cn(
            "h-4 w-4 mr-2",
            isFavorite && "fill-current"
          )} 
        />
        {isFavorite ? "Đã yêu thích" : "Yêu thích"}
      </motion.div>
    </Button>
  )
}
