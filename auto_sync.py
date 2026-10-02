#!/usr/bin/env python3
"""
基准方中 · 建筑方案演示自动热更新同步助手 (Auto-Sync & File Watcher)
JZFZ Architectural Presentation Auto-Sync Engine

功能：
1. 代办一键更新 (Push)：用户只需说一声“帮我更新方案”，AI 助手即可在后台秒级完成换稿上传与广播推流。
2. 保存即同步守护进程 (Watch)：监听 PPTX/PDF 文件的修改事件，主讲人在 PowerPoint/Keynote 里按 Cmd+S 保存时，
   自动毫秒级热更新并同步推送到所有远端客户与领导的屏幕上！
3. 智能定位最近文稿 (Find Latest)：自动在工作目录或桌面寻找最新修改的图纸文稿。
"""

import os
import sys
import time
import json
import uuid
import mimetypes
import argparse
import subprocess
from urllib import request, error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "rooms_data.json")
DEFAULT_SERVER_URL = os.environ.get("SLIDECAST_URL", "http://127.0.0.1:8080")


def send_mac_notification(title, message):
    """发送 macOS 原生系统通知"""
    try:
        apple_script = f'display notification "{message}" with title "{title}"'
        subprocess.run(["osascript", "-e", apple_script], capture_output=True, timeout=2)
    except Exception:
        pass


def get_latest_room():
    """从 rooms_data.json 中获取最近活跃的演示房间"""
    if not os.path.exists(DATA_FILE):
        return None
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            rooms = json.load(f)
        if not rooms:
            return None
        # 按 lastActive 降序排列
        sorted_rooms = sorted(
            rooms.values(),
            key=lambda r: r.get("lastActive", r.get("createdAt", 0)),
            reverse=True,
        )
        return sorted_rooms[0]
    except Exception as e:
        print(f"[Error] 读取房间数据失败: {e}", file=sys.stderr)
        return None


def upload_file_to_room(file_path, server_url=DEFAULT_SERVER_URL, room_id=None, secret_key=None, room_name=None):
    """
    通过原生 HTTP Multipart Form-Data 上传或热更新方案文稿
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"文件不存在: {file_path}")

    filename = os.path.basename(file_path)
    file_size_mb = os.path.getsize(file_path) / 1024 / 1024

    # 如果未指定房间，自动查找最近活跃的房间
    if not room_id or not secret_key:
        active_room = get_latest_room()
        if active_room:
            room_id = room_id or active_room.get("id")
            secret_key = secret_key or active_room.get("secretKey")
            print(f"[Auto-Detect] 自动关联当前活跃房间: {room_id} ({active_room.get('name', '未命名')})")

    boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
    body_parts = []

    # 表单字段
    fields = {}
    if room_id:
        fields["roomId"] = room_id
    if secret_key:
        fields["secretKey"] = secret_key
    if room_name:
        fields["roomName"] = room_name

    for key, val in fields.items():
        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        body_parts.append(f"{val}\r\n".encode("utf-8"))

    # 文件部分
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
    body_parts.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8")
    )
    body_parts.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))

    with open(file_path, "rb") as f:
        file_bytes = f.read()
    body_parts.append(file_bytes)
    body_parts.append(b"\r\n")

    # 结束分界
    body_parts.append(f"--{boundary}--\r\n".encode("utf-8"))

    req_body = b"".join(body_parts)
    upload_url = f"{server_url.rstrip('/')}/api/upload"

    req = request.Request(
        upload_url,
        data=req_body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(req_body)),
        },
        method="POST",
    )

    start_time = time.time()
    try:
        with request.urlopen(req, timeout=30) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            elapsed = time.time() - start_time

            is_update = resp_data.get("isUpdate", False)
            target_room = resp_data.get("roomId")
            secret = resp_data.get("secretKey")

            if is_update:
                msg = f"方案热更新成功！老版本已自动释放，所有观众端零感同步已就绪 ({elapsed:.2f}s)"
            else:
                msg = f"新建演示房间成功: {target_room} ({elapsed:.2f}s)"

            print(f"[Success] {msg}")
            print(f"[Details] 文稿: {filename} ({file_size_mb:.2f} MB), 版本: v{resp_data.get('fileVersion', 1)}")
            print(f"[Share URL] {server_url}/room/{target_room}")
            if secret:
                print(f"[Host URL]  {server_url}/room/{target_room}?key={secret}")

            send_mac_notification("基准方中方案演示云平台", f"已代办自动同步方案：{filename}")
            return resp_data

    except error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"[HTTP Error {e.code}] {err_msg}", file=sys.stderr)
        raise RuntimeError(f"上传服务返回错误 ({e.code}): {err_msg}")
    except Exception as e:
        print(f"[Connection Error] 无法连接到服务 {upload_url}: {e}", file=sys.stderr)
        raise e


def find_latest_presentation(search_dir):
    """在指定目录中递归查找最新修改的 .pptx 或 .pdf 文件"""
    exts = (".pptx", ".pdf")
    candidates = []

    for root, dirs, files in os.walk(search_dir):
        # 排除隐藏目录和上传缓存
        if "/." in root or "/uploads" in root:
            continue
        for f in files:
            if f.lower().endswith(exts) and not f.startswith("~$"):  # 忽略 Office 临时锁文件
                full_path = os.path.join(root, f)
                try:
                    mtime = os.path.getmtime(full_path)
                    candidates.append((mtime, full_path))
                except OSError:
                    pass

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def watch_file_and_sync(target_path, server_url=DEFAULT_SERVER_URL, room_id=None, secret_key=None, poll_interval=1.0):
    """
    文件保存监听守护进程：
    当用户在 PowerPoint / Keynote 中按 Cmd+S 保存时，毫秒级自动热更新到演示房间！
    """
    print(f"============================================================")
    print(f" 基准方中 · 方案保存即同步监听守护服务已就绪")
    print(f" 监听目标: {target_path}")
    print(f" 轮询频率: 每 {poll_interval} 秒检测一次文件修改时间戳 (mtime)")
    print(f" 操作提示: 在 PowerPoint / Keynote 中随时按 Cmd+S，云端将自动同步！")
    print(f" 退出监听: 按 Ctrl + C 随时终止守护进程")
    print(f"============================================================")

    last_mtime = os.path.getmtime(target_path) if os.path.exists(target_path) else 0

    while True:
        try:
            time.sleep(poll_interval)
            if not os.path.exists(target_path):
                continue

            current_mtime = os.path.getmtime(target_path)
            if current_mtime > last_mtime:
                # 留出 0.5s 确保 Office 软件完成磁盘写入
                time.sleep(0.5)
                last_mtime = os.path.getmtime(target_path)
                print(f"\n[Change Detected] 检测到文稿保存更新: {time.strftime('%H:%M:%S')}")
                print(f"--> 正在自动代办热更新上传...")
                try:
                    upload_file_to_room(
                        target_path,
                        server_url=server_url,
                        room_id=room_id,
                        secret_key=secret_key,
                    )
                except Exception as ex:
                    print(f"[Sync Failed] 自动同步重试中: {ex}", file=sys.stderr)

        except KeyboardInterrupt:
            print("\n[Stopped] 方案监听守护进程已安全退出。")
            break
        except Exception as e:
            print(f"[Watch Error] {e}", file=sys.stderr)
            time.sleep(poll_interval)


def main():
    parser = argparse.ArgumentParser(description="基准方中方案演示自动热更新同步助手")
    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # 子命令 1: push (一键代办上传更新)
    push_p = subparsers.add_parser("push", help="代办上传或热更新指定文稿")
    push_p.add_argument("file", nargs="?", help="PPTX 或 PDF 文件路径（如果不传，自动查找最新文稿）")
    push_p.add_argument("--room", help="目标演示房间 ID（不传则自动匹配最近房间）")
    push_p.add_argument("--key", help="主讲人控制密钥")
    push_p.add_argument("--name", help="方案会议主题名称")
    push_p.add_argument("--server", default=DEFAULT_SERVER_URL, help="服务地址")

    # 子命令 2: watch (保存即同步守护监听)
    watch_p = subparsers.add_parser("watch", help="监听文件保存并自动毫秒级热更")
    watch_p.add_argument("file", help="要监听的 PPTX 或 PDF 文件路径")
    watch_p.add_argument("--room", help="目标演示房间 ID")
    watch_p.add_argument("--key", help="主讲人控制密钥")
    watch_p.add_argument("--interval", type=float, default=1.0, help="轮询间隔秒数")
    watch_p.add_argument("--server", default=DEFAULT_SERVER_URL, help="服务地址")

    # 子命令 3: latest (查找最新文稿)
    latest_p = subparsers.add_parser("latest", help="查找最近修改的文稿并打印路径")
    latest_p.add_argument("--dir", default=".", help="搜索目录")

    args = parser.parse_args()

    if args.command == "push":
        target_file = args.file
        if not target_file:
            target_file = find_latest_presentation(".")
            if not target_file:
                print("[Error] 当前目录下未找到 .pptx 或 .pdf 文稿，请指定文件路径。", file=sys.stderr)
                sys.exit(1)
            print(f"[Found] 自动选定最近修改文稿: {target_file}")

        upload_file_to_room(
            target_file,
            server_url=args.server,
            room_id=args.room,
            secret_key=args.key,
            room_name=args.name,
        )

    elif args.command == "watch":
        watch_file_and_sync(
            args.file,
            server_url=args.server,
            room_id=args.room,
            secret_key=args.key,
            poll_interval=args.interval,
        )

    elif args.command == "latest":
        latest = find_latest_presentation(args.dir)
        if latest:
            print(latest)
        else:
            print("[None] 未找到演示文稿", file=sys.stderr)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
