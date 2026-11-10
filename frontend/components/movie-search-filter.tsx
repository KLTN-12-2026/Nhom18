'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface MovieSearchFilterProps {
  onSearchChange: (value: string) => void
  onGenreChange: (value: string) => void
  onRatingChange: (value: string) => void
  onSortChange: (value: string) => void
  onYearChange?: (value: string) => void
  searchValue: string
  genreValue: string
  ratingValue: string
  sortValue: string
  yearValue?: string
  genres: string[]
  ratings: string[]
}

export function MovieSearchFilter({
  onSearchChange,
  onGenreChange,
  onRatingChange,
  onSortChange,
  searchValue,
  genreValue,
  ratingValue,
  sortValue,
  genres,
  ratings,
}: MovieSearchFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const activeFiltersCount = [genreValue, ratingValue].filter(v => v && v !== 'all').length

  const clearAllFilters = () => {
    onSearchChange('')
    onGenreChange('all')
    onRatingChange('all')
    onSortChange('popular')
  }

  const hasActiveFilters = searchValue || activeFiltersCount > 0

  return (
    <div className="space-y-4">
      {/* Search Bar - Always Visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Tìm kiếm phim theo tên..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-10 h-12 text-base"
        />
        {searchValue && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={() => onSearchChange('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Desktop Filters */}
      <div className="hidden md:flex items-center gap-3 flex-wrap">
        {/* Genre Filter */}
        <Select value={genreValue} onValueChange={onGenreChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Thể loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thể loại</SelectItem>
            {genres.map((genre) => (
              <SelectItem key={genre} value={genre}>
                {genre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Rating Filter */}
        <Select value={ratingValue} onValueChange={onRatingChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Phân loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {ratings.map((rating) => (
              <SelectItem key={rating} value={rating}>
                {rating}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortValue} onValueChange={onSortChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sắp xếp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Phổ biến</SelectItem>
            <SelectItem value="newest">Mới nhất</SelectItem>
            <SelectItem value="oldest">Cũ nhất</SelectItem>
            <SelectItem value="a-z">A → Z</SelectItem>
            <SelectItem value="z-a">Z → A</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={clearAllFilters}
            className="ml-auto"
          >
            <X className="h-4 w-4 mr-2" />
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {/* Mobile Filter Sheet */}
      <div className="md:hidden flex items-center gap-3">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex-1 relative">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Bộ lọc
              {activeFiltersCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh]">
            <SheetHeader>
              <SheetTitle>Bộ lọc phim</SheetTitle>
              <SheetDescription>
                Tùy chỉnh kết quả tìm kiếm của bạn
              </SheetDescription>
            </SheetHeader>
            
            <div className="space-y-4 mt-6">
              {/* Genre */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Thể loại</label>
                <Select value={genreValue} onValueChange={onGenreChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn thể loại" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả thể loại</SelectItem>
                    {genres.map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Phân loại tuổi</label>
                <Select value={ratingValue} onValueChange={onRatingChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn phân loại" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {ratings.map((rating) => (
                      <SelectItem key={rating} value={rating}>
                        {rating}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sắp xếp</label>
                <Select value={sortValue} onValueChange={onSortChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sắp xếp theo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popular">Phổ biến</SelectItem>
                    <SelectItem value="newest">Mới nhất</SelectItem>
                    <SelectItem value="oldest">Cũ nhất</SelectItem>
                    <SelectItem value="a-z">A → Z</SelectItem>
                    <SelectItem value="z-a">Z → A</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={clearAllFilters}
                >
                  Xóa tất cả
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => setIsOpen(false)}
                >
                  Áp dụng
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sort Quick Access */}
        <Select value={sortValue} onValueChange={onSortChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sắp xếp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Phổ biến</SelectItem>
            <SelectItem value="newest">Mới nhất</SelectItem>
            <SelectItem value="oldest">Cũ nhất</SelectItem>
            <SelectItem value="a-z">A → Z</SelectItem>
            <SelectItem value="z-a">Z → A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Đang lọc:</span>
          {genreValue && genreValue !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {genreValue}
              <button onClick={() => onGenreChange('all')} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {ratingValue && ratingValue !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {ratingValue}
              <button onClick={() => onRatingChange('all')} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
