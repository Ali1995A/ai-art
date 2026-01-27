# Pink Doodle AI（网页版）

给 5 岁左右“不识字也能用”的横屏/竖屏网页应用：

- 横屏：左侧涂鸦区，右侧 AI 出图
- 竖屏：上下布局
- 粉色系、iOS 审美，优化 iPad Pro（第一代）与微信内置浏览器触控体验
- 点击风格按钮直接生成（支持排队）
- 支持相册导入底图、底色设置、笔刷/橡皮/撤销/清除、全屏涂鸦、保存并自动水印

## 本地运行

1) 安装依赖

```bash
npm install
```

2) 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 AIHubMix Key：

- `AIHUBMIX_API_KEY`（必填）
- `AIHUBMIX_BASE_URL`（默认 `https://aihubmix.com/v1`）
- `AIHUBMIX_IMAGE_MODEL`（默认 `doubao-seedream-4-5`）
- `AIHUBMIX_IMAGE_API=predictions`（Doubao/Seedream 必须走 predictions）
- `AIHUBMIX_DOUBAO_SIZE=2k`（Seedream 最小像素要求；建议保持 `2k`）

3) 启动

```bash
npm run dev
```

打开 `http://localhost:3000`

## 部署到 Vercel

- 直接把这个仓库导入到 Vercel（Framework 选 Next.js）
- 在 Vercel 项目 Settings → Environment Variables 配置环境变量（同 `.env.example`）
- 部署即可

## 使用说明（交互）

- 涂鸦区：画笔颜色（256 色墙 + 最近 12 色 + 灰阶）、底色、橡皮、撤销、清除、全屏/恢复（图标按钮）
- 顶部：相册（导入图片为涂鸦底图）、笔画大小（滑动条 1–99）、保存（保存涂鸦 + 当前生成图）
- 生图区：点击任意风格按钮即生成（可连续点击多个风格进入队列）

## 接口说明

前端只调用一个接口：`POST /api/generate`

- `txt2img`：无涂鸦时走文生图
- `img2img`：有涂鸦时把画布 PNG 发给后端走图生图

说明：Doubao/Seedream 通过 AIHubMix 的 `predictions` 方式调用（由后端适配），并已针对参数做了兼容处理。

## 保存与水印

- 点击“保存”会保存两张图：
  - `doodle_YYYY-MM-DD_CC.png`（当前涂鸦：底色 + 底图 + 笔迹）
  - `ai_YYYY-MM-DD_CC.png`（当前生成图，如果存在）
- 两张图右下角会自动添加日期与“CC”水印（更小、更规整、50% 透明度，且不会重叠）。
- 如果从相册导入带本应用水印的图片，会自动忽略/擦除水印区域再作为底图加载。

### iPad / iOS 说明（重要）

iOS 网页无法像原生 App 一样“自动写入相册”。本项目的策略是：

- 优先尝试系统分享（Share Sheet）：你可以在分享面板里点“存储到照片”。
- 如果分享不可用/失败：会提供“下载”按钮（iOS 多文件自动下载经常被拦截），按按钮可保存到“文件”或再手动存到相册。

### 保存后返回不丢失画面

在 iPad 上，保存/下载过程中可能会打开预览页或触发页面重载。为避免返回后涂鸦丢失：

- 本应用会在保存/下载前打标记，并把涂鸦状态 + 生图预览写入本地存储；返回后自动恢复。
- 新开标签页/新开链接不会自动恢复（默认空画布）。

## 推送到 GitHub（示例）

```bash
git add -A
git commit -m "init"
git remote add origin <你的仓库地址>
git push -u origin main
```
