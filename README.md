# 🎬 Lyric Cinematic Experience

Trải nghiệm điện ảnh với nền động, nhạc nền, và hiệu ứng chữ kiểu cinema.

## 🚀 Cấu trúc dự án

```
├── src/                    # Frontend source (Vite)
│   ├── main.js
│   └── style.css
├── server/                 # Backend (Express — chạy local)
│   ├── index.js            # Express server
│   ├── setting.json        # Cài đặt
│   ├── background_images/  # Ảnh nền
│   ├── background_music/   # Nhạc nền
│   └── background_videos/  # Video nền
├── public/                 # Static assets + Cloudflare config
│   ├── _headers
│   └── _redirects
├── scripts/
│   └── build-media.js      # Build script (copy media + gen API JSON)
├── dist/                   # Build output
├── index.html
├── package.json
├── vite.config.js
└── wrangler.toml
```

## 🖥️ Chạy Local

```bash
# Cài dependencies
npm install

# Chạy cả server + frontend (dev)
npm run dev

# Hoặc chạy riêng:
npm run server    # Express server tại http://localhost:3001
npm run client    # Vite dev server tại http://localhost:5173

# Build static
npm run build

# Preview build
npm run preview
```

## ☁️ Deploy lên Cloudflare Pages

### Yêu cầu
1. Tài khoản [Cloudflare](https://dash.cloudflare.com/sign-up)
2. Git repo (GitHub, GitLab, hoặc Bitbucket)

### Cách 1: Deploy qua GitHub (Khuyên dùng) 🏆

1. **Tạo GitHub repo** và push code lên:
   ```bash
   git init
   git add .
   git commit -m "🎬 Initial commit"
   git remote add origin https://github.com/<USERNAME>/<REPO>.git
   git push -u origin main
   ```

2. **Vào Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**

3. **Chọn repo** vừa push

4. **Cấu hình build**:
   - **Framework preset**: `None`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory (optional)**: `/`

5. **Environment Variables (optional)**:
   - `NODE_VERSION`: `18`

6. **Nhấn Save & Deploy** ✅

### Cách 2: Deploy qua Wrangler CLI

1. **Cài Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Login Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Build và Deploy**:
   ```bash
   npm run deploy
   ```

### Media Files khi deploy

Khi build, script `scripts/build-media.js` sẽ tự động:
- Quét các file ảnh/nhạc/video trong `server/background_*/`
- Copy vào `dist/server/background_*/`
- Tạo các file JSON API trong `dist/api/`

⚠ **Lưu ý**: File media phải có dung lượng nhỏ hơn **25MB** (giới hạn của GitHub).

   - File lớn hơn 25MB → dùng Cloudflare R2 hoặc URL ngoài
   - Chỉnh sửa trong `src/main.js` (mảng `IMAGES` và `musicTracks`)

## 📂 Thêm Media

- **Ảnh nền**: copy vào `server/background_images/`
- **Nhạc nền**: copy vào `server/background_music/`
- **Video nền**: copy vào `server/background_videos/`

Định dạng hỗ trợ:
- Ảnh: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- Nhạc: `.mp3`, `.wav`, `.m4a`, `.ogg`
- Video: `.mp4`
