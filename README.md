# Pink Doodle AI（网页版）

给 5 岁左右“不识字也能用”的横屏/竖屏网页应用：

- 横屏：左侧涂鸦区，右侧 AI 出图
- 竖屏：上下布局
- 粉色系、iOS 审美，优化 iPad Pro（第一代）与微信内置浏览器触控体验

## 本地运行

1) 安装依赖

```bash
npm install
```

2) 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 AIHubMix Key：

- `AIHUBMIX_API_KEY`
- `AIHUBMIX_BASE_URL`（默认 `https://aihubmix.com/v1`）
- `AIHUBMIX_IMAGE_MODEL`（默认 `doubao-seedream-4-5`）

3) 启动

```bash
npm run dev
```

打开 `http://localhost:3000`

## 部署到 Vercel

- 直接把这个仓库导入到 Vercel（Framework 选 Next.js）
- 在 Vercel 项目里配置环境变量（同 `.env.example`）
- 部署即可

## 接口说明

前端只调用一个接口：`POST /api/generate`

- `txt2img`：无涂鸦时走文生图
- `img2img`：有涂鸦时把画布 PNG 发给后端走图生图

## 推送到 GitHub（示例）

```bash
git add -A
git commit -m "init"
git remote add origin <你的仓库地址>
git push -u origin main
```
