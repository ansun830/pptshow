# SlideCast - PPT/PDF 实时协同演示与即时更新平台 (小存储云服务器优化版)

SlideCast 是一款专为工作演示、线上会议与培训设计的轻量级 Web 演示平台。只需上传 PPT 或 PDF，即可自动生成固定分享网址；演示时支持毫秒级翻页与激光笔同步，并支持**换稿不换链（重新上传直接热替换）**。

针对**云服务器磁盘存储较小（如 10GB~20GB 或系统盘配额受限）**的实际情况，系统内置了 4 重存储空间自清理与防爆机制，确保服务器磁盘始终保持轻盈。

---

## 💾 针对“小存储云服务器”的 4 重专项优化

1. **版本自动覆盖与老旧文稿即时清除**：
   - 当主讲人点击【更新 PPT】换稿时，新文件落盘成功后，**系统会立即物理删除上一版本的历史文件**，绝不在服务器堆积重复文稿。
2. **后台自动垃圾回收 (TTL Auto-Purge)**：
   - 内置后台守护清理线程，每 30 分钟轮询一次。
   - 超过指定时间（默认 24 小时）未活动的演示房间及其上传文稿，将自动从磁盘彻底抹除。
3. **主讲人一键销毁释放空间**：
   - 会议或汇报结束后，主讲人可在界面右上角直接点击【结束并清理】。系统将立即物理删除文稿文件并释放磁盘空间，同时通知观众端演示已结束。
4. **单文件体积智能拦截**：
   - 默认限制单文件上限为 200MB（可通过环境变量自定义），防止突发大文件上传耗尽服务器空间。
5. **极小环境开销**：
   - 若使用 **Python 模式** 运行：利用 Linux 系统自带 Python 3 标准库，**0 额外安装包、无需 node_modules**，项目整体体积仅数百 KB！

---

## 🌟 核心功能一览

* **固定分享网址，换稿不换链**：上传后网址固定；换稿后观众端无感自动更新，无需重新发链接。
* **主讲人与观众权限隔离**：
  * **主讲人管理链**：格式为 `?room=xxx&key=yyy`，拥有翻页控制、激光笔、文稿替换与销毁权限。
  * **观众分享链**：格式为 `?room=xxx`，只读跟随，无法随意翻动或篡改演示。
* **毫秒级实时同步**：基于轻量 Server-Sent Events (SSE) 协议，翻页、激光笔动作毫秒级同步。
* **自由浏览 / 一键归队**：观众可临时前后翻看课件，随时点击【回到主讲人画面】一键归队。
* **格式双重兼容**：支持 `.pptx` 与 `.pdf` 双格式自适应矢量级渲染。

---

## 🚀 部署方式

### 方式 A：云服务器 Python 原生启动（最省空间，推荐！）

无需安装任何依赖（不需要 `pip install`，无 node_modules 膨胀）：

```bash
cd slide-cast
# 默认端口 8080，文稿默认保留 24 小时
python3 app.py 8080
```

**自定义存储参数（可选）：**
```bash
# 保留 12 小时后自动清除，限制单文件最大 30MB
CLEANUP_HOURS=12 MAX_UPLOAD_MB=30 nohup python3 app.py 8080 > server.log 2>&1 &
```

---

### 方式 B：云服务器 Docker 容器化部署

如果习惯使用 Docker：

```bash
cd slide-cast
docker compose up -d --build
```
启动后可通过浏览器访问 `http://<你的服务器IP>:8080`。

---

### 方式 C：通过 GitHub 部署到免费云平台（Render / Railway）

如果完全不想占用云服务器的任何磁盘：
1. 将本项目推送到您的 GitHub 私有仓库：
   ```bash
   cd slide-cast
   git init
   git add .
   git commit -m "feat: initial commit for SlideCast"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```
2. 登录 [Render.com](https://render.com) 关联 GitHub 仓库，选择 Web Service 部署，即可享受平台提供的独立计算资源与免费 HTTPS 域名。

---

## ⚙️ 存储控制环境变量配置

| 环境变量 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `PORT` | `8080` | HTTP 服务监听端口 |
| `CLEANUP_HOURS` | `24` | 文稿保留时长（小时），超过后自动物理删除文件 |
| `MAX_UPLOAD_MB` | `200` | 单个上传文稿的最大体积限制 (MB) |

---

## 📂 项目结构

```text
slide-cast/
├── app.py                # Python 3 零依赖标准库后端 (内置自动磁盘垃圾清理与版本剔除)
├── server.js             # Node.js + Express 版本服务端
├── package.json          # Node.js 依赖配置
├── Dockerfile            # 容器构建文件
├── docker-compose.yml    # 容器编排文件
├── README.md             # 本说明文档
├── uploads/              # 文稿存储目录 (老版本与过期文件自动清理)
└── public/               # 前端单页应用
    ├── index.html        # 演示主页与视口结构
    ├── style.css         # 演示暗色现代主题
    └── app.js            # 客户端双端逻辑、PDF/PPTX 渲染、SSE 实时同步、销毁控制
```
