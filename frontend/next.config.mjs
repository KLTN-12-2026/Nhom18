/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http',  hostname: 'localhost' },
      // impawards.com (kho poster phim uy tín, dùng cho vài phim Harry Potter)
      // không hỗ trợ HTTPS khi serve ảnh trực tiếp (301 redirect lỗi vòng lặp
      // nếu ép https) — phải khai riêng http cho đúng domain này thay vì chờ
      // wildcard https ở trên (wildcard chỉ áp cho protocol https).
      { protocol: 'http',  hostname: 'www.impawards.com' },
    ],
    // CHỈ dùng WebP — KHÔNG bật AVIF.
    //
    // AVIF nén tốt hơn WebP khoảng 20-30% nhưng MÃ HOÁ CỰC KỲ CHẬM trên CPU.
    // Đo thực tế trên chính máy này (lần đầu tải, chưa có cache):
    //     poster 676KB -> AVIF 7.525ms  |  WebP 1.382ms
    //     poster 468KB -> AVIF 4.984ms  |  WebP 2.740ms
    //     poster TMDB  -> AVIF 2.910ms  |  WebP   894ms
    // Một trang danh sách phim có ~20 poster sẽ phải mã hoá 20 ảnh như vậy —
    // đó chính là lý do chuyển trang mất hàng chục giây ở lần xem đầu. Bỏ AVIF
    // giúp nhanh gấp 2-5 lần mà mắt thường gần như không phân biệt được.
    formats: ['image/webp'],

    // Giữ ảnh đã tối ưu 30 ngày thay vì 1 GIỜ. Poster/banner phim gần như không
    // bao giờ đổi, nhưng TTL 1 giờ khiến Next.js phải mã hoá LẠI toàn bộ ảnh mỗi
    // giờ — người dùng quay lại sau đó lại phải chờ từ đầu. Khi admin đổi poster
    // thì URL ảnh cũng đổi theo nên không sợ hiển thị ảnh cũ.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  experimental: {
    // Tree-shake các icon libraries lớn
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', '@radix-ui/react-dialog'],
    // Prefetch ngay khi link xuất hiện trong viewport (mặc định Next.js 14 là on-hover)
    // Không đặt tùy chọn này để dùng default behavior của Next.js App Router
  },

  compress: true,
  poweredByHeader: false,
  swcMinify: true,
  reactStrictMode: true,
  optimizeFonts: true,

  // HTTP headers giúp browser cache tài nguyên tĩnh
  async headers() {
    return [
      {
        source: '/(.*)\\.(js|css|woff2|png|jpg|jpeg|webp|avif|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default nextConfig
