"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Menu, X, LogIn, User, LogOut, Settings, Ticket, Lock, Mail, Phone, Heart } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { ThemeToggle } from "@/components/theme-toggle"
import { useHiddenItems } from "@/lib/admin-menu-prefs"
import { BirthdayBanner } from "@/components/birthday-banner"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const hiddenItems = useHiddenItems()
  const showFavorites = !hiddenItems.includes("feature:favorites")

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const handleLogout = async () => {
    await logout()
    setIsProfileOpen(false)
  }

  const navLinkClass = (isActive: boolean) =>
    isActive
      ? "relative text-primary font-semibold after:absolute after:-bottom-2 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-primary"
      : "relative text-muted-foreground hover:text-foreground transition-colors"

  return (
    <>
      <BirthdayBanner />
      <header className="border-b border-border/80 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50 shadow-[0_8px_24px_-20px_color-mix(in_oklch,var(--color-primary)_40%,transparent)]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" prefetch={true} className="flex items-center space-x-3 group">
            <div className="relative bg-[#0d1521] rounded-xl p-1.5 ring-1 ring-white/10 shadow-lg shadow-black/30 group-hover:scale-105 transition-all duration-300">
              <Image src="/logo-icon.png" alt="CinemaGold" width={40} height={40} className="h-10 w-10 object-contain" priority />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold bg-gradient-to-r from-primary via-primary to-primary/80 bg-clip-text text-transparent leading-tight group-hover:tracking-wide transition-all">
                CinemaGold
              </span>
              <span className="text-[10px] text-primary/90 font-semibold leading-tight tracking-widest uppercase">
                🎬 Đặt vé xem phim
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            <Link 
              href="/" 
              prefetch={true}
              className={navLinkClass(pathname === "/")}
            >
              Trang chủ
            </Link>
            <Link
              href="/movies"
              prefetch={true}
              className={navLinkClass(pathname === "/movies" || pathname?.startsWith("/movie/"))}
            >
              Danh sách phim
            </Link>
            <Link
              href="/showtimes"
              prefetch={true}
              className={navLinkClass(pathname === "/showtimes")}
            >
              Lịch chiếu
            </Link>
            <Link
              href="/cinemas"
              prefetch={true}
              className={navLinkClass(pathname === "/cinemas" || pathname?.startsWith("/cinema/"))}
            >
              Rạp chiếu
            </Link>
          </nav>

          {/* Desktop Auth Section */}
          <div className="hidden lg:flex items-center space-x-4">
            <ThemeToggle />
            {user ? (
              <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full" aria-label="Mở menu tài khoản">
                    <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity">
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                        {getInitials(user.first_name, user.last_name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle className="text-2xl">Tài khoản của tôi</SheetTitle>
                    <SheetDescription>
                      Quản lý thông tin cá nhân và cài đặt tài khoản
                    </SheetDescription>
                  </SheetHeader>
                  
                  <div className="mt-6 space-y-6">
                    {/* User Info Section */}
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                          {getInitials(user.first_name, user.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">
                          {user.first_name} {user.last_name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span>{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Menu Options */}
                    <div className="space-y-2">
                      <Link
                        href="/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">Tài khoản của tôi</p>
                          <p className="text-sm text-muted-foreground">Hồ sơ, mật khẩu &amp; điểm thưởng</p>
                        </div>
                      </Link>

                      <Link
                        href="/bookings"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Ticket className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">Vé của tôi</p>
                          <p className="text-sm text-muted-foreground">Xem lịch sử đặt vé của bạn</p>
                        </div>
                      </Link>

                      {showFavorites && (
                      <Link
                        href="/favorites"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Heart className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">Phim yêu thích</p>
                          <p className="text-sm text-muted-foreground">Danh sách phim đã lưu</p>
                        </div>
                      </Link>
                      )}

                      {!user.is_google_account && (
                        <Link
                          href="/profile?tab=password"
                          onClick={() => setIsProfileOpen(false)}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Lock className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">Đổi mật khẩu</p>
                            <p className="text-sm text-muted-foreground">Cập nhật mật khẩu của bạn</p>
                          </div>
                        </Link>
                      )}

                      {user.can_access_admin && (
                        <Link 
                          href="/admin" 
                          onClick={() => setIsProfileOpen(false)}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Settings className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">Bảng quản trị</p>
                            <p className="text-sm text-muted-foreground">Quản lý hệ thống</p>
                          </div>
                        </Link>
                      )}
                    </div>

                    <Separator />

                    {/* Logout Button */}
                    <Button 
                      variant="destructive" 
                      className="w-full" 
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Đăng xuất
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">
                    <LogIn className="h-4 w-4 mr-2" />
                    Đăng nhập
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Đăng ký</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-foreground hover:text-primary"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border">
            <nav className="flex flex-col space-y-4">
              <Link 
                href="/" 
                className={navLinkClass(pathname === "/")}
              >
                Trang chủ
              </Link>
              <Link
                href="/movies"
                className={navLinkClass(pathname === "/movies" || pathname?.startsWith("/movie/"))}
              >
                Danh sách phim
              </Link>
              <Link
                href="/showtimes"
                className={navLinkClass(pathname === "/showtimes")}
              >
                Lịch chiếu
              </Link>
              <Link
                href="/cinemas"
                className={navLinkClass(pathname === "/cinemas" || pathname?.startsWith("/cinema/"))}
              >
                Rạp chiếu
              </Link>

              <div className="flex items-center gap-3 pt-2">
                <ThemeToggle />
              </div>

              <div className="pt-4 border-t border-border">
                {user ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-4">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials(user.first_name, user.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                      <Link href="/profile">
                        <User className="h-4 w-4 mr-2" />
                        Hồ sơ
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                      <Link href="/bookings">
                        <Settings className="h-4 w-4 mr-2" />
                        Vé của tôi
                      </Link>
                    </Button>
                    {user.can_access_admin && (
                      <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                        <Link href="/admin">
                          <Settings className="h-4 w-4 mr-2" />
                          Bảng quản trị
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start">
                      <LogOut className="h-4 w-4 mr-2" />
                      Đăng xuất
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/login">
                        <LogIn className="h-4 w-4 mr-2" />
                        Đăng nhập
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href="/register">Đăng ký</Link>
                    </Button>
                  </div>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
    </>
  )
}
