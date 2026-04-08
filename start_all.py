"""
QuickNote 速记通 - 一键部署启动脚本

启动 Node.js 后端 (Express + SQLite) 和前端 (Vite React) 开发服务器。
支持在别人电脑上直接部署运行，也支持在本机打包 APK。

Usage:
  python start_all.py              # 完整启动前后端
  python start_all.py --check      # 仅检查环境
  python start_all.py --skip-frontend  # 仅启动后端
  python start_all.py --build-apk  # 构建前端并打包 APK（在自己电脑上用）

Stop with Ctrl+C and the script will shut down both child processes.

Compatibility: Python 3.7+
"""

from __future__ import annotations

import argparse
import os
import re
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
import shutil
import socket
from typing import Dict, List, Optional

# ─── 项目路径 ───────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

# ─── 端口配置 ───────────────────────────────────────────────
BACKEND_PORT = int(os.environ.get("BACKEND_PORT", "3001"))
FRONTEND_PORT = int(os.environ.get("FRONTEND_PORT", "5173"))

# ─── 本地工具目录名探测列表 ──────────────────────────────────
NODE_DIR_NAMES = ["nodejs", "node", "node-v", "node-lts"]


# ═══════════════════════════════════════════════════════════
#  工具函数
# ═══════════════════════════════════════════════════════════

def print_banner() -> None:
    """Print startup banner."""
    print("=" * 60)
    print("      QuickNote 速记通 - 一键部署启动脚本")
    print("=" * 60)
    print(f"  项目目录: {ROOT}")
    print(f"  后端端口: {BACKEND_PORT}")
    print(f"  前端端口: {FRONTEND_PORT}")
    print("=" * 60)
    print()


def get_local_ip() -> str:
    """获取本机局域网 IP。"""
    # 方法1: 通过 UDP 连接获取
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    # 方法2: 通过 hostname 获取
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                return ip
    except Exception:
        pass
    return "localhost"


def stream_output(proc: subprocess.Popen, name: str) -> None:
    """Stream child process output with a prefix."""
    assert proc.stdout is not None
    for line in proc.stdout:
        sys.stdout.write(f"[{name}] {line}")
    proc.stdout.close()


def find_bundled_node() -> Optional[Path]:
    """在项目根目录查找本地打包的 Node.js 目录。"""
    for entry in ROOT.iterdir():
        if not entry.is_dir():
            continue
        name_lower = entry.name.lower()
        for hint in NODE_DIR_NAMES:
            if name_lower.startswith(hint) or hint in name_lower:
                # Windows 下 Node.js 通常直接放 node.exe 而非 bin/ 子目录
                if (entry / "node.exe").exists() or (entry / "npm.cmd").exists():
                    return entry
                if (entry / "bin" / "node").exists():
                    return entry / "bin"
                # 可能多了一层嵌套，如 nodejs/node-v18.x.x/
                for sub in entry.iterdir():
                    if sub.is_dir():
                        if (sub / "node.exe").exists() or (sub / "npm.cmd").exists():
                            return sub
                        if (sub / "bin" / "node").exists():
                            return sub / "bin"
    return None


def build_env() -> Dict[str, str]:
    """构建子进程环境变量，优先使用本地打包的 Node.js。"""
    env = os.environ.copy()
    path_key = next((k for k in env.keys() if k.lower() == "path"), "PATH")
    env.setdefault(path_key, "")

    node_dir = find_bundled_node()
    if node_dir:
        try:
            rel = node_dir.relative_to(ROOT)
        except ValueError:
            rel = node_dir
        print(f"✓ 发现本地 Node.js: {rel}")
        env[path_key] = str(node_dir) + os.pathsep + env[path_key]

    return env


def check_command(cmd: str, env: Dict[str, str]) -> bool:
    """检查命令是否可用。"""
    path_key = next((k for k in env.keys() if k.lower() == "path"), "PATH")
    return shutil.which(cmd, path=env.get(path_key)) is not None


def resolve_cmd(cmd: List[str], env: Dict[str, str]) -> List[str]:
    """将命令列表中的第一个元素解析为绝对路径。"""
    exe = cmd[0]
    if Path(exe).is_absolute():
        return cmd
    path_key = next((k for k in env.keys() if k.lower() == "path"), "PATH")
    found = shutil.which(exe, path=env.get(path_key))
    if not found:
        raise FileNotFoundError(f"命令未找到: {exe}（请确认已安装并在 PATH 中）")
    return [found] + cmd[1:]


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """检查端口是否被占用。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def kill_process_on_port(port: int) -> bool:
    """终止占用指定端口的进程。"""
    if os.name != "nt":
        try:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                for pid in result.stdout.strip().split("\n"):
                    subprocess.run(["kill", "-9", pid], timeout=5)
                return True
        except Exception:
            pass
        return False

    # Windows
    try:
        result = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return False
        pids = set()
        for line in result.stdout.split("\n"):
            if f":{port}" in line and ("LISTENING" in line or "ESTABLISHED" in line):
                parts = line.split()
                if len(parts) >= 5:
                    try:
                        pid = int(parts[-1])
                        if pid > 0:
                            pids.add(pid)
                    except ValueError:
                        continue
        if not pids:
            return False
        killed = False
        for pid in pids:
            try:
                r = subprocess.run(
                    ["taskkill", "/F", "/PID", str(pid)],
                    capture_output=True, text=True, timeout=10
                )
                if r.returncode == 0:
                    print(f"  已终止占用端口 {port} 的进程 (PID: {pid})")
                    killed = True
            except Exception:
                continue
        if killed:
            time.sleep(1)
        return killed
    except Exception as e:
        print(f"  查杀进程时出错: {e}")
        return False


def ensure_port_free(port: int, name: str) -> None:
    """确保端口空闲，被占用时自动尝试终止。"""
    if not is_port_in_use(port):
        return
    print(f"\n⚠ {name}端口 {port} 已被占用，正在尝试终止占用进程...")
    if kill_process_on_port(port):
        if not is_port_in_use(port):
            print(f"✓ 端口 {port} 已释放")
            return
    print(f"✗ 端口 {port} 仍被占用，请手动关闭占用该端口的进程。")
    sys.exit(1)


def run_npm_install(directory: Path, env: Dict[str, str], label: str) -> bool:
    """在指定目录执行 npm install（仅当 node_modules 不存在时）。"""
    node_modules = directory / "node_modules"
    if node_modules.exists() and any(node_modules.iterdir()):
        print(f"✓ {label}依赖已安装 (node_modules 存在)")
        return True

    print(f"正在安装{label}依赖 (npm install)...")
    try:
        npm_cmd = resolve_cmd(["npm", "install"], env)
        result = subprocess.run(
            npm_cmd,
            cwd=str(directory),
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode == 0:
            print(f"✓ {label}依赖安装完成")
            return True
        else:
            print(f"✗ npm install 失败:")
            print(result.stderr[:500] if result.stderr else result.stdout[:500])
            return False
    except subprocess.TimeoutExpired:
        print("✗ npm install 超时 (5分钟)")
        return False
    except FileNotFoundError:
        print("✗ 未找到 npm 命令")
        return False


def sync_api_ip(ip: str) -> None:
    """将局域网 IP 写入 frontend/src/api.js 的 DEFAULT_SERVER。"""
    api_file = FRONTEND_DIR / "src" / "api.js"
    if not api_file.exists():
        print("⚠ 未找到 frontend/src/api.js，跳过 IP 同步")
        return

    content = api_file.read_text(encoding="utf-8")
    new_server = f"http://{ip}:{BACKEND_PORT}"
    # 替换 DEFAULT_SERVER = 'http://...:3001'
    new_content = re.sub(
        r"(const\s+DEFAULT_SERVER\s*=\s*')[^']*(')",
        rf"\g<1>{new_server}\2",
        content,
    )
    if new_content != content:
        api_file.write_text(new_content, encoding="utf-8")
        print(f"✓ 已同步服务器地址到 api.js: {new_server}")
    else:
        print(f"✓ api.js 服务器地址已是最新: {new_server}")


def start_process(name: str, cmd: List[str], cwd: Path, env: Dict[str, str]) -> subprocess.Popen:
    """启动子进程并在后台线程中流式输出日志。"""
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    proc = subprocess.Popen(
        resolve_cmd(cmd, env),
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creationflags,
    )
    threading.Thread(target=stream_output, args=(proc, name), daemon=True).start()
    return proc


def stop_process(proc: subprocess.Popen) -> None:
    """优雅地停止子进程。"""
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            proc.terminate()
        proc.wait(timeout=10)
    except Exception:
        proc.kill()


# ═══════════════════════════════════════════════════════════
#  环境检查
# ═══════════════════════════════════════════════════════════

def check_prerequisites(env: Dict[str, str]) -> List[str]:
    """检查所有前置条件，返回错误列表。"""
    errors = []

    if not BACKEND_DIR.exists():
        errors.append(f"后端目录不存在: {BACKEND_DIR}")
    if not FRONTEND_DIR.exists():
        errors.append(f"前端目录不存在: {FRONTEND_DIR}")

    if not check_command("node", env):
        errors.append("未找到 Node.js。请安装 Node.js 或将 nodejs 目录放在项目根目录。")
    if not check_command("npm", env):
        errors.append("未找到 npm。请安装 Node.js (含 npm) 或将 nodejs 目录放在项目根目录。")

    # 检查 Node.js 版本
    if check_command("node", env):
        try:
            path_key = next((k for k in env.keys() if k.lower() == "path"), "PATH")
            node_exe = shutil.which("node", path=env.get(path_key))
            result = subprocess.run(
                [node_exe, "--version"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                version = result.stdout.strip()
                print(f"✓ Node.js 版本: {version}")
        except Exception:
            pass

    return errors


# ═══════════════════════════════════════════════════════════
#  APK 打包
# ═══════════════════════════════════════════════════════════

def build_apk(env: Dict[str, str]) -> None:
    """构建前端并同步到 Android 工程，尝试自动打包 APK。"""
    ip = get_local_ip()
    if ip != "localhost":
        sync_api_ip(ip)

    # 1. 安装前端依赖
    if not run_npm_install(FRONTEND_DIR, env, "前端"):
        sys.exit(1)

    # 2. 构建前端 (vite build)
    print("\n正在构建前端 (npm run build)...")
    try:
        build_cmd = resolve_cmd(["npm", "run", "build"], env)
        result = subprocess.run(
            build_cmd,
            cwd=str(FRONTEND_DIR),
            env=env,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            print("✗ 前端构建失败")
            sys.exit(1)
        print("✓ 前端构建完成 (dist/)")
    except Exception as e:
        print(f"✗ 前端构建失败: {e}")
        sys.exit(1)

    # 3. Capacitor 同步到 Android
    print("\n正在同步到 Android 工程 (npx cap sync android)...")
    try:
        sync_cmd = resolve_cmd(["npx", "cap", "sync", "android"], env)
        result = subprocess.run(
            sync_cmd,
            cwd=str(FRONTEND_DIR),
            env=env,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            print("✗ Capacitor sync 失败")
            sys.exit(1)
        print("✓ Android 工程同步完成")
    except Exception as e:
        print(f"✗ Capacitor sync 失败: {e}")
        sys.exit(1)

    # 4. 尝试 gradlew 自动构建 APK
    android_dir = FRONTEND_DIR / "android"
    gradlew = android_dir / ("gradlew.bat" if os.name == "nt" else "gradlew")

    if gradlew.exists():
        print("\n正在打包 APK (gradlew assembleDebug)...")
        try:
            result = subprocess.run(
                [str(gradlew), "assembleDebug"],
                cwd=str(android_dir),
                env=env,
                text=True,
                timeout=600,  # Gradle 构建可能较慢
            )
            if result.returncode == 0:
                # 查找生成的 APK 文件
                apk_dir = android_dir / "app" / "build" / "outputs" / "apk" / "debug"
                apk_files = list(apk_dir.glob("*.apk")) if apk_dir.exists() else []
                if apk_files:
                    apk_path = apk_files[0]
                    # 复制到项目根目录
                    target = ROOT / "QuickNote-速记通.apk"
                    shutil.copy2(apk_path, target)
                    print(f"\n✓ APK 打包成功！")
                    print(f"  APK 路径: {target}")
                else:
                    print("✓ Gradle 构建完成，但未找到 APK 文件")
                    print(f"  请检查: {apk_dir}")
            else:
                print("✗ Gradle 构建失败")
                print("  请使用 Android Studio 打开以下目录手动构建:")
                print(f"  {android_dir}")
        except subprocess.TimeoutExpired:
            print("✗ Gradle 构建超时 (10分钟)")
        except Exception as e:
            print(f"✗ Gradle 构建失败: {e}")
            print("  请使用 Android Studio 打开以下目录手动构建:")
            print(f"  {android_dir}")
    else:
        print(f"\n未找到 gradlew，请使用 Android Studio 打开以下目录手动构建 APK:")
        print(f"  {android_dir}")

    print()
    print("=" * 60)
    print("  APK 构建流程完成")
    print("=" * 60)


# ═══════════════════════════════════════════════════════════
#  主入口
# ═══════════════════════════════════════════════════════════

def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="QuickNote 速记通 一键部署脚本 - 启动后端 + 前端",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
环境变量:
  BACKEND_PORT    后端端口 (默认: 3001)
  FRONTEND_PORT   前端端口 (默认: 5173)

示例:
  python start_all.py              # 完整启动
  python start_all.py --check      # 仅检查环境
  python start_all.py --skip-frontend  # 仅启动后端
  python start_all.py --build-apk  # 构建 APK (在自己电脑上用)
""",
    )
    parser.add_argument("--check", action="store_true", help="仅检查环境配置，不启动服务")
    parser.add_argument("--skip-frontend", action="store_true", help="仅启动后端，不启动前端开发服务器")
    parser.add_argument("--build-apk", action="store_true", help="构建前端并打包 APK（在自己电脑上用）")
    parser.add_argument("--no-npm-install", action="store_true", help="跳过自动安装依赖")
    parser.add_argument("--no-ip-sync", action="store_true", help="跳过自动同步 IP 到 api.js")
    return parser.parse_args()


def main() -> None:
    """Main entry point."""
    # 确保终端正确输出中文
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    args = parse_args()
    print_banner()

    # ── 构建环境（探测本地 Node.js）──
    print("正在检测环境配置...")
    child_env = build_env()
    print()

    # ── 前置检查 ──
    errors = check_prerequisites(child_env)
    if errors:
        print("\n" + "=" * 60)
        print("环境检查失败，发现以下问题:")
        print("=" * 60)
        for i, err in enumerate(errors, 1):
            print(f"  {i}. {err}")
        print()
        print("解决方案:")
        print("  - 将 Node.js 解压到项目根目录的 nodejs 文件夹，脚本会自动检测")
        print("  - 或者安装 Node.js 到系统并添加到 PATH 环境变量")
        print("  - 下载地址: https://nodejs.org/")
        print("=" * 60)
        sys.exit(1)

    if args.check:
        print("\n✓ 环境检查通过！所有依赖已就绪。")
        ip = get_local_ip()
        print(f"\n  本机局域网 IP: {ip}")
        print(f"  后端地址: http://{ip}:{BACKEND_PORT}")
        print(f"  管理后台: http://{ip}:{BACKEND_PORT}/admin")
        return

    # ── APK 打包模式 ──
    if args.build_apk:
        build_apk(child_env)
        return

    # ── IP 同步 ──
    ip = get_local_ip()
    print(f"✓ 本机局域网 IP: {ip}")
    if not args.no_ip_sync and ip != "localhost":
        sync_api_ip(ip)
    print()

    # ── 端口检查 ──
    ensure_port_free(BACKEND_PORT, "后端")
    if not args.skip_frontend:
        ensure_port_free(FRONTEND_PORT, "前端")
    print(f"✓ 端口可用")

    # ── 安装依赖 ──
    if not args.no_npm_install:
        print()
        if not run_npm_install(BACKEND_DIR, child_env, "后端"):
            print("\n✗ 无法安装后端依赖，请手动运行: cd backend && npm install")
            sys.exit(1)
        if not args.skip_frontend:
            if not run_npm_install(FRONTEND_DIR, child_env, "前端"):
                print("\n✗ 无法安装前端依赖，请手动运行: cd frontend && npm install")
                sys.exit(1)

    # ── 启动后端 ──
    print()
    try:
        backend_proc = start_process(
            "backend", ["node", "server.js"], BACKEND_DIR, env=child_env
        )
    except FileNotFoundError as exc:
        print(f"\n✗ 启动后端失败: {exc}")
        sys.exit(1)

    print(f"后端启动中... (等待端口 {BACKEND_PORT} 就绪)")

    # 等待后端就绪
    for _ in range(60):  # 30 秒超时
        if backend_proc.poll() is not None:
            print(f"\n✗ 后端已退出，返回码 {backend_proc.returncode}。请查看上方日志。")
            sys.exit(1)
        if is_port_in_use(BACKEND_PORT):
            break
        time.sleep(0.5)
    else:
        print("\n✗ 后端未在预期时间内启动。")
        stop_process(backend_proc)
        sys.exit(1)

    print(f"✓ 后端已就绪 (端口 {BACKEND_PORT})")

    procs = {"backend": backend_proc}

    # ── 启动前端 ──
    if not args.skip_frontend:
        print("正在启动前端开发服务器...")
        try:
            frontend_proc = start_process(
                "frontend", ["npm", "run", "dev"], FRONTEND_DIR, env=child_env
            )
        except FileNotFoundError as exc:
            print(f"\n✗ 启动前端失败: {exc}")
            stop_process(backend_proc)
            sys.exit(1)

        # 等待前端初始化
        time.sleep(3)
        if frontend_proc.poll() is not None:
            print(f"\n✗ 前端已退出，返回码 {frontend_proc.returncode}。请查看上方日志。")
            stop_process(backend_proc)
            sys.exit(1)

        procs["frontend"] = frontend_proc

    # ── 启动成功 ──
    print()
    print("=" * 60)
    print("  ✓ 系统启动成功！")
    print("=" * 60)
    print(f"  📱 App后端:   http://{ip}:{BACKEND_PORT}")
    print(f"  💻 管理后台:  http://{ip}:{BACKEND_PORT}/admin")
    if not args.skip_frontend:
        print(f"  🖥️  前端开发:  http://localhost:{FRONTEND_PORT}")
    print(f"  🏠 本地后端:  http://localhost:{BACKEND_PORT}")
    print("=" * 60)
    print("  按 Ctrl+C 停止所有服务")
    print("=" * 60)
    print()

    # ── 监控进程 ──
    try:
        while True:
            for name, proc in list(procs.items()):
                code = proc.poll()
                if code is not None:
                    print(f"\n{name} 已退出 (返回码 {code})，正在停止其他服务...")
                    for other_name, other in procs.items():
                        if other is not proc:
                            stop_process(other)
                    return
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n正在停止所有服务...")
        for proc in procs.values():
            stop_process(proc)
        print("✓ 所有服务已停止")


if __name__ == "__main__":
    main()
