/**
 * SlideCast - Node.js + Express + WebSocket / SSE 服务端 (小存储云服务器优化版)
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const CLEANUP_HOURS = parseInt(process.env.CLEANUP_HOURS || "24", 10);
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || "50", 10);

const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "rooms_data.json");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

let rooms = {};
let sseSubscribers = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    rooms = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    console.error("加载房间数据失败:", e);
  }
}

function saveRooms() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2), "utf-8");
  } catch (e) {
    console.error("保存房间数据失败:", e);
  }
}

// 后台定时垃圾回收机制 (每 30 分钟)
setInterval(() => {
  const now = Date.now();
  const cutoff = now - CLEANUP_HOURS * 3600 * 1000;
  let modified = false;

  Object.keys(rooms).forEach((rid) => {
    const room = rooms[rid];
    const lastActive = room.lastActive || room.createdAt || now;
    if (lastActive < cutoff) {
      if (room.fileUrl && room.fileUrl.startsWith("/uploads/")) {
        const filePath = path.join(UPLOAD_DIR, path.basename(room.fileUrl));
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`[Auto Cleanup] 已清理过期文稿: ${filePath}`);
          } catch (err) {}
        }
      }
      delete rooms[rid];
      modified = true;
    }
  });

  if (modified) saveRooms();
}, 1800000);

function broadcastEvent(roomId, eventType, data) {
  const clients = sseSubscribers[roomId] || [];
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead = [];
  clients.forEach((res) => {
    try {
      res.write(payload);
    } catch (err) {
      dead.push(res);
    }
  });
  if (dead.length > 0) {
    sseSubscribers[roomId] = clients.filter((c) => !dead.includes(c));
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const tempName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, tempName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

// API: 上传 / 换稿更新
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "未接收到上传的文件或体积超过限制" });
  }

  const { roomId, secretKey, roomName } = req.body;
  const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf-8");
  const ext = path.extname(originalName).toLowerCase();

  if (ext !== ".pdf" && ext !== ".pptx") {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "仅支持 .pptx 和 .pdf 文件格式" });
  }

  const fileType = ext === ".pdf" ? "pdf" : "pptx";

  // 热替换
  if (roomId && rooms[roomId]) {
    const room = rooms[roomId];
    if (secretKey && secretKey === room.secretKey) {
      const oldUrl = room.fileUrl;
      const newVersion = (room.fileVersion || 1) + 1;
      const finalFileName = `${roomId}-v${newVersion}${ext}`;
      const finalPath = path.join(UPLOAD_DIR, finalFileName);
      fs.renameSync(req.file.path, finalPath);

      // 空间优化：立即移除老版本文件
      if (oldUrl && oldUrl.startsWith("/uploads/")) {
        const oldFile = path.join(UPLOAD_DIR, path.basename(oldUrl));
        if (fs.existsSync(oldFile) && oldFile !== finalPath) {
          try {
            fs.unlinkSync(oldFile);
          } catch (e) {}
        }
      }

      room.fileName = originalName;
      room.fileType = fileType;
      room.fileUrl = `/uploads/${finalFileName}`;
      room.fileVersion = newVersion;
      room.lastActive = Date.now();
      if (roomName) room.name = roomName;
      saveRooms();

      broadcastEvent(roomId, "file_updated", {
        fileVersion: newVersion,
        fileName: originalName,
        fileType,
        fileUrl: room.fileUrl,
        currentPage: room.currentPage || 1,
      });

      return res.json({
        success: true,
        isUpdate: true,
        roomId,
        secretKey: room.secretKey,
        fileName: originalName,
        fileType,
        fileUrl: room.fileUrl,
        fileVersion: newVersion,
      });
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "主讲人身份校验失败" });
    }
  }

  // 新建房间
  const newRoomId = Math.random().toString(36).substring(2, 10);
  const newSecret = Math.random().toString(36).substring(2, 14);
  const finalFileName = `${newRoomId}-v1${ext}`;
  const finalPath = path.join(UPLOAD_DIR, finalFileName);
  fs.renameSync(req.file.path, finalPath);

  const newRoom = {
    id: newRoomId,
    name: roomName || path.parse(originalName).name,
    fileName: originalName,
    fileType,
    fileUrl: `/uploads/${finalFileName}`,
    fileVersion: 1,
    secretKey: newSecret,
    currentPage: 1,
    totalPages: 1,
    createdAt: Date.now(),
    lastActive: Date.now(),
    laser: { active: false, x: 0, y: 0 },
  };

  rooms[newRoomId] = newRoom;
  saveRooms();

  return res.json({
    success: true,
    isUpdate: false,
    roomId: newRoomId,
    secretKey: newSecret,
    fileName: originalName,
    fileType,
    fileUrl: newRoom.fileUrl,
    fileVersion: 1,
    name: newRoom.name,
  });
});

// API: 主讲人一键销毁房间并删除文件
app.post("/api/room/:id/delete", (req, res) => {
  const roomId = req.params.id;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: "房间不存在" });

  const clientKey = req.headers["x-presenter-key"] || req.body.secretKey;
  if (clientKey !== room.secretKey) {
    return res.status(403).json({ error: "未授权: 密钥不正确" });
  }

  if (room.fileUrl && room.fileUrl.startsWith("/uploads/")) {
    const fpath = path.join(UPLOAD_DIR, path.basename(room.fileUrl));
    if (fs.existsSync(fpath)) {
      try {
        fs.unlinkSync(fpath);
        console.log(`[Manual Delete] 主讲人已销毁文稿: ${fpath}`);
      } catch (e) {}
    }
  }

  broadcastEvent(roomId, "room_deleted", { message: "演示已结束，文稿已从服务器清除以释放空间" });

  delete rooms[roomId];
  saveRooms();

  res.json({ success: true, message: "房间与文稿已删除，存储空间已释放" });
});

// API: 获取房间详情
app.get("/api/room/:id", (req, res) => {
  const roomId = req.params.id;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: "房间不存在" });

  const clientKey = req.query.key || req.headers["x-presenter-key"];
  const isPresenter = Boolean(clientKey && clientKey === room.secretKey);

  room.lastActive = Date.now();
  saveRooms();

  res.json({
    id: room.id,
    name: room.name,
    fileName: room.fileName,
    fileType: room.fileType,
    fileUrl: room.fileUrl,
    fileVersion: room.fileVersion || 1,
    currentPage: room.currentPage || 1,
    totalPages: room.totalPages || 1,
    laser: room.laser || { active: false, x: 0, y: 0 },
    isPresenter,
  });
});

// API: 实时同步
app.post("/api/room/:id/sync", (req, res) => {
  const roomId = req.params.id;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: "房间不存在" });

  const clientKey = req.headers["x-presenter-key"] || req.body.secretKey;
  if (clientKey !== room.secretKey) {
    return res.status(403).json({ error: "未授权" });
  }

  const { page, totalPages, laser } = req.body;
  if (page !== undefined) room.currentPage = parseInt(page);
  if (totalPages !== undefined) room.totalPages = parseInt(totalPages);
  if (laser !== undefined) room.laser = laser;
  room.lastActive = Date.now();
  saveRooms();

  const syncData = {
    page: room.currentPage,
    totalPages: room.totalPages,
    laser: room.laser,
  };
  broadcastEvent(roomId, "sync", syncData);

  res.json({ success: true, state: syncData });
});

// API: SSE 事件流
app.get("/api/room/:id/events", (req, res) => {
  const roomId = req.params.id;
  if (!rooms[roomId]) return res.status(404).send("Room not found");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  if (!sseSubscribers[roomId]) sseSubscribers[roomId] = [];
  sseSubscribers[roomId].push(res);

  const room = rooms[roomId];
  res.write(
    `event: state\ndata: ${JSON.stringify({
      type: "init",
      currentPage: room.currentPage,
      totalPages: room.totalPages,
      fileVersion: room.fileVersion,
      fileUrl: room.fileUrl,
      fileType: room.fileType,
      laser: room.laser,
    })}\n\n`
  );

  const interval = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    sseSubscribers[roomId] = (sseSubscribers[roomId] || []).filter((c) => c !== res);
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SlideCast Node 服务已启动 (存储优化已开启): http://0.0.0.0:${PORT}`);
});
