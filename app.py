#!/usr/bin/env python3
"""
SlideCast - PPT/PDF 实时同步演示 Web 服务 (Python 零依赖独立运行版)
针对小存储云服务器深度优化:
1. 换稿自动删除历史版本，绝不堆叠垃圾文稿。
2. 内置后台自动回收机制 (默认 24 小时自动清理过期文稿，释放磁盘)。
3. 主讲人一键销毁房间，演示结束后立即释放服务器磁盘空间。
4. 严格单文件体积上限拦截 (默认 50MB)，防止把服务器撑爆。
"""

import os
import sys
import json
import uuid
import time
import mimetypes
import threading
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DATA_FILE = os.path.join(BASE_DIR, "rooms_data.json")

# 存储优化参数配置
CLEANUP_HOURS = int(os.environ.get("CLEANUP_HOURS", 24))  # 超过 24 小时未活动的房间自动销毁
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", 50))  # 单个文件体积上限 (MB)

os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

rooms_lock = threading.Lock()
rooms = {}  # roomId -> room_data
subscribers = {}  # roomId -> list of response queues


def load_rooms():
    global rooms
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                rooms = json.load(f)
        except Exception as e:
            print(f"[Warning] Failed to load {DATA_FILE}: {e}")


def save_rooms():
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(rooms, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Warning] Failed to save {DATA_FILE}: {e}")


load_rooms()


def auto_cleanup_task():
    """后台定时清理线程：每 30 分钟检查一次过期房间与孤立文件，释放磁盘空间"""
    while True:
        try:
            time.sleep(1800)  # 30 分钟
            now = time.time()
            cutoff = now - (CLEANUP_HOURS * 3600)
            expired_room_ids = []

            with rooms_lock:
                for rid, rdata in list(rooms.items()):
                    last_time = rdata.get("lastActive", rdata.get("createdAt", now))
                    if last_time < cutoff:
                        expired_room_ids.append(rid)

            for rid in expired_room_ids:
                with rooms_lock:
                    room = rooms.pop(rid, None)
                if room:
                    file_url = room.get("fileUrl", "")
                    if file_url.startswith("/uploads/"):
                        file_path = os.path.join(UPLOAD_DIR, os.path.basename(file_url))
                        if os.path.exists(file_path):
                            try:
                                os.remove(file_path)
                                print(f"[Cleanup] 自动清理过期文稿: {file_path}")
                            except Exception as e:
                                print(f"[Cleanup Error] {e}")

            # 检查 uploads 目录下的孤立未登记文件
            with rooms_lock:
                active_files = {os.path.basename(r.get("fileUrl", "")) for r in rooms.values()}
            
            for fname in os.listdir(UPLOAD_DIR):
                if fname == ".gitkeep":
                    continue
                fpath = os.path.join(UPLOAD_DIR, fname)
                if os.path.isfile(fpath) and fname not in active_files:
                    try:
                        # 超过 2 小时的未激活孤儿文件清理
                        if os.path.getmtime(fpath) < (now - 7200):
                            os.remove(fpath)
                            print(f"[Cleanup] 清理孤儿文件: {fname}")
                    except Exception:
                        pass

            save_rooms()
        except Exception as e:
            print(f"[Cleanup Loop Error] {e}")


# 启动后台守护清理线程
cleanup_thread = threading.Thread(target=auto_cleanup_task, daemon=True)
cleanup_thread.start()


def broadcast_event(room_id, event_type, data):
    with rooms_lock:
        clients = subscribers.get(room_id, [])

    payload = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")
    dead_clients = []

    for q in list(clients):
        try:
            q.put_nowait(payload)
        except Exception:
            dead_clients.append(q)

    if dead_clients:
        with rooms_lock:
            if room_id in subscribers:
                for d in dead_clients:
                    if d in subscribers[room_id]:
                        subscribers[room_id].remove(d)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class SlideCastHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {self.command} {self.path} - {args[0]}\n")

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Presenter-Key")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # 1. API: 获取房间详情
        if path.startswith("/api/room/"):
            parts = path.strip("/").split("/")
            if len(parts) == 3 and parts[2] != "events":
                room_id = parts[2]
                self.handle_get_room(room_id, query)
                return
            elif len(parts) == 4 and parts[3] == "events":
                room_id = parts[2]
                self.handle_sse(room_id)
                return

        # 2. 静态文件: uploads
        if path.startswith("/uploads/"):
            rel_file = path.replace("/uploads/", "", 1)
            file_path = os.path.abspath(os.path.join(UPLOAD_DIR, rel_file))
            if file_path.startswith(UPLOAD_DIR) and os.path.exists(file_path):
                self.serve_file(file_path)
                return
            else:
                self.send_error(404, "File Not Found")
                return

        # 3. 静态文件: 前端界面 (SPA 单页)
        if path == "/" or path == "/index.html":
            file_path = os.path.join(PUBLIC_DIR, "index.html")
            self.serve_file(file_path, "text/html; charset=utf-8")
            return

        local_path = os.path.abspath(os.path.join(PUBLIC_DIR, path.lstrip("/")))
        if local_path.startswith(PUBLIC_DIR) and os.path.exists(local_path) and os.path.isfile(local_path):
            self.serve_file(local_path)
            return

        default_index = os.path.join(PUBLIC_DIR, "index.html")
        if os.path.exists(default_index):
            self.serve_file(default_index, "text/html; charset=utf-8")
        else:
            self.send_error(404, "Page Not Found")

    def serve_file(self, filepath, content_type=None):
        if not content_type:
            content_type, _ = mimetypes.guess_type(filepath)
            if not content_type:
                content_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def handle_get_room(self, room_id, query):
        with rooms_lock:
            room = rooms.get(room_id)

        if not room:
            self.send_json({"error": "Room not found"}, 404)
            return

        presenter_key = query.get("key", [None])[0] or self.headers.get("X-Presenter-Key")
        is_presenter = bool(presenter_key and presenter_key == room.get("secretKey"))

        with rooms_lock:
            room["lastActive"] = time.time()
            save_rooms()

        data = {
            "id": room["id"],
            "name": room.get("name", "演示房间"),
            "fileName": room.get("fileName"),
            "fileType": room.get("fileType"),
            "fileUrl": room.get("fileUrl"),
            "fileVersion": room.get("fileVersion", 1),
            "currentPage": room.get("currentPage", 1),
            "totalPages": room.get("totalPages", 1),
            "laser": room.get("laser", {"active": False, "x": 0, "y": 0}),
            "isPresenter": is_presenter
        }
        self.send_json(data)

    def handle_sse(self, room_id):
        with rooms_lock:
            if room_id not in rooms:
                self.send_error(404, "Room not found")
                return

        import queue
        q = queue.Queue(maxsize=100)

        with rooms_lock:
            if room_id not in subscribers:
                subscribers[room_id] = []
            subscribers[room_id].append(q)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_cors_headers()
        self.end_headers()

        with rooms_lock:
            room = rooms.get(room_id, {})
            init_state = {
                "type": "init",
                "currentPage": room.get("currentPage", 1),
                "totalPages": room.get("totalPages", 1),
                "fileVersion": room.get("fileVersion", 1),
                "fileUrl": room.get("fileUrl"),
                "fileType": room.get("fileType"),
                "laser": room.get("laser", {"active": False, "x": 0, "y": 0})
            }
        try:
            self.wfile.write(f"event: state\ndata: {json.dumps(init_state, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()
        except Exception:
            return

        last_ping = time.time()
        while True:
            try:
                try:
                    payload = q.get(timeout=2.0)
                    self.wfile.write(payload)
                    self.wfile.flush()
                except queue.Empty:
                    pass

                if time.time() - last_ping > 15:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last_ping = time.time()

            except (BrokenPipeError, ConnectionResetError, IOError):
                break
            except Exception:
                break

        with rooms_lock:
            if room_id in subscribers and q in subscribers[room_id]:
                subscribers[room_id].remove(q)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/upload":
            self.handle_upload()
            return

        if path.startswith("/api/room/") and path.endswith("/sync"):
            parts = path.strip("/").split("/")
            room_id = parts[2]
            self.handle_sync(room_id)
            return

        if path.startswith("/api/room/") and path.endswith("/delete"):
            parts = path.strip("/").split("/")
            room_id = parts[2]
            self.handle_delete_room(room_id)
            return

        self.send_error(404, "Endpoint Not Found")

    def handle_delete_room(self, room_id):
        """主讲人一键销毁房间并立即物理删除服务器上的 PPT 文件，释放磁盘"""
        with rooms_lock:
            room = rooms.get(room_id)

        if not room:
            self.send_json({"error": "Room not found"}, 404)
            return

        key = self.headers.get("X-Presenter-Key")
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                key = key or data.get("secretKey")
            except Exception:
                pass

        if key != room.get("secretKey"):
            self.send_json({"error": "Unauthorized: Presenter key mismatch"}, 403)
            return

        # 物理删除文件
        file_url = room.get("fileUrl", "")
        if file_url.startswith("/uploads/"):
            file_path = os.path.join(UPLOAD_DIR, os.path.basename(file_url))
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"[Manual Delete] 主讲人已销毁文稿并释放空间: {file_path}")
                except Exception as e:
                    print(f"[Delete Error] {e}")

        # 广播房间关闭销毁通知
        broadcast_event(room_id, "room_deleted", {"message": "演示已结束，文稿已从服务器清除以释放空间"})

        with rooms_lock:
            rooms.pop(room_id, None)
            save_rooms()

        self.send_json({"success": True, "message": "房间与文件已彻底删除，服务器磁盘空间已释放"})

    def handle_sync(self, room_id):
        with rooms_lock:
            room = rooms.get(room_id)

        if not room:
            self.send_json({"error": "Room not found"}, 404)
            return

        key = self.headers.get("X-Presenter-Key")
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            data = json.loads(body)
        except Exception:
            self.send_json({"error": "Invalid JSON"}, 400)
            return

        provided_key = key or data.get("secretKey")
        if provided_key != room.get("secretKey"):
            self.send_json({"error": "Unauthorized: Presenter key mismatch"}, 403)
            return

        with rooms_lock:
            if "page" in data:
                room["currentPage"] = int(data["page"])
            if "totalPages" in data:
                room["totalPages"] = int(data["totalPages"])
            if "laser" in data:
                room["laser"] = data["laser"]
            room["lastActive"] = time.time()
            save_rooms()

        broadcast_data = {
            "page": room["currentPage"],
            "totalPages": room.get("totalPages", 1),
            "laser": room.get("laser", {"active": False, "x": 0, "y": 0})
        }
        broadcast_event(room_id, "sync", broadcast_data)
        self.send_json({"success": True, "state": broadcast_data})

    def handle_upload(self):
        content_length = int(self.headers.get("Content-Length", 0))
        # 严格限制上传体积，保护云服务器磁盘
        if content_length > MAX_UPLOAD_MB * 1024 * 1024:
            self.send_json({"error": f"文件体积超过上限 ({MAX_UPLOAD_MB}MB)，已拦截以保护服务器存储空间"}, 413)
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self.send_json({"error": "Content-Type must be multipart/form-data"}, 400)
            return

        boundary = None
        for item in content_type.split(";"):
            item = item.strip()
            if item.startswith("boundary="):
                boundary = item.split("=", 1)[1].strip('"').encode("latin1")
                break

        if not boundary:
            self.send_json({"error": "Missing boundary in multipart form"}, 400)
            return

        body = self.rfile.read(content_length)
        parts = body.split(b"--" + boundary)
        form_fields = {}
        uploaded_file = None
        orig_filename = "presentation"

        for part in parts:
            if not part or part == b"--\r\n" or part == b"--":
                continue
            if b"\r\n\r\n" not in part:
                continue

            header_part, content_part = part.split(b"\r\n\r\n", 1)
            if content_part.endswith(b"\r\n"):
                content_part = content_part[:-2]

            headers_text = header_part.decode("latin1")
            disposition = None
            for line in headers_text.split("\r\n"):
                if line.lower().startswith("content-disposition:"):
                    disposition = line
                    break

            if not disposition:
                continue

            params = {}
            for item in disposition.split(";"):
                item = item.strip()
                if "=" in item:
                    k, v = item.split("=", 1)
                    params[k.lower()] = v.strip('"')

            field_name = params.get("name")
            if "filename" in params:
                filename = params["filename"]
                if filename:
                    try:
                        filename = filename.encode("latin1").decode("utf-8")
                    except Exception:
                        pass
                    uploaded_file = content_part
                    orig_filename = filename
            elif field_name:
                try:
                    form_fields[field_name] = content_part.decode("utf-8")
                except Exception:
                    form_fields[field_name] = content_part.decode("latin1")

        if not uploaded_file:
            self.send_json({"error": "No file uploaded"}, 400)
            return

        room_id = form_fields.get("roomId", "").strip()
        secret_key = form_fields.get("secretKey", "").strip()
        room_name = form_fields.get("roomName", "").strip()

        ext = os.path.splitext(orig_filename)[1].lower()
        if ext not in [".pdf", ".pptx"]:
            self.send_json({"error": "仅支持 .pptx 和 .pdf 文件格式"}, 400)
            return

        file_type = "pdf" if ext == ".pdf" else "pptx"

        with rooms_lock:
            is_update = False
            if room_id and room_id in rooms:
                existing_room = rooms[room_id]
                if secret_key and secret_key == existing_room.get("secretKey"):
                    is_update = True
                else:
                    self.send_json({"error": "Forbidden: Invalid secret key for this room"}, 403)
                    return

            if is_update:
                room = rooms[room_id]
                old_file_url = room.get("fileUrl", "")

                new_version = room.get("fileVersion", 1) + 1
                save_filename = f"{room_id}-v{new_version}{ext}"
                dest_path = os.path.join(UPLOAD_DIR, save_filename)
                with open(dest_path, "wb") as f:
                    f.write(uploaded_file)

                # 【空间优化核心】：立即删除老版本文件，绝不产生双份冗余占用
                if old_file_url.startswith("/uploads/"):
                    old_path = os.path.join(UPLOAD_DIR, os.path.basename(old_file_url))
                    if os.path.exists(old_path) and old_path != dest_path:
                        try:
                            os.remove(old_path)
                            print(f"[Space Optimization] 已清除历史版本文稿: {old_path}")
                        except Exception as e:
                            print(f"[Cleanup Error] {e}")

                room["fileName"] = orig_filename
                room["fileType"] = file_type
                room["fileUrl"] = f"/uploads/{save_filename}"
                room["fileVersion"] = new_version
                room["lastActive"] = time.time()
                if room_name:
                    room["name"] = room_name
                save_rooms()

                broadcast_data = {
                    "fileVersion": new_version,
                    "fileName": orig_filename,
                    "fileType": file_type,
                    "fileUrl": room["fileUrl"],
                    "currentPage": room.get("currentPage", 1)
                }
                broadcast_event(room_id, "file_updated", broadcast_data)

                self.send_json({
                    "success": True,
                    "isUpdate": True,
                    "roomId": room_id,
                    "secretKey": room["secretKey"],
                    "fileName": orig_filename,
                    "fileType": file_type,
                    "fileUrl": room["fileUrl"],
                    "fileVersion": new_version
                })
                return
            else:
                new_room_id = str(uuid.uuid4())[:8]
                new_secret = str(uuid.uuid4())[:12]
                save_filename = f"{new_room_id}-v1{ext}"
                dest_path = os.path.join(UPLOAD_DIR, save_filename)
                with open(dest_path, "wb") as f:
                    f.write(uploaded_file)

                new_room = {
                    "id": new_room_id,
                    "name": room_name or os.path.splitext(orig_filename)[0],
                    "fileName": orig_filename,
                    "fileType": file_type,
                    "fileUrl": f"/uploads/{save_filename}",
                    "fileVersion": 1,
                    "secretKey": new_secret,
                    "currentPage": 1,
                    "totalPages": 1,
                    "createdAt": time.time(),
                    "lastActive": time.time(),
                    "laser": {"active": False, "x": 0, "y": 0}
                }
                rooms[new_room_id] = new_room
                save_rooms()

                self.send_json({
                    "success": True,
                    "isUpdate": False,
                    "roomId": new_room_id,
                    "secretKey": new_secret,
                    "fileName": orig_filename,
                    "fileType": file_type,
                    "fileUrl": new_room["fileUrl"],
                    "fileVersion": 1,
                    "name": new_room["name"]
                })

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)


def run_server(port=8080):
    server_address = ("0.0.0.0", port)
    httpd = ThreadedHTTPServer(server_address, SlideCastHandler)
    print(f"==================================================")
    print(f" SlideCast 演示平台已启动！(存储自优化保护已启用)")
    print(f" 本地访问: http://127.0.0.1:{port}")
    print(f" 局域网:   http://[你的本机IP]:{port}")
    print(f" 存储策略: 换稿自动覆盖删除，文稿保留 {CLEANUP_HOURS}h")
    print(f"==================================================")
    httpd.serve_forever()


if __name__ == "__main__":
    port = 8080
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
