from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import socket
import ssl
import subprocess
import sys
from urllib.parse import urlparse

HOST = "0.0.0.0"
PORT = 8080

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CERT_FILE = SCRIPT_DIR / "192.168.15.5+2.pem"
KEY_FILE = SCRIPT_DIR / "192.168.15.5+2-key.pem"
SITE_DIR = PROJECT_ROOT

IGNORED_SOCKET_ERRORS = (
    BrokenPipeError,
    ConnectionAbortedError,
    ConnectionResetError,
    ssl.SSLEOFError,
    ssl.SSLZeroReturnError,
)


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        if self.path != "/__open_folder__":
            self.send_error(404, "Endpoint not found")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            payload = self.rfile.read(content_length) if content_length > 0 else b"{}"
            data = json.loads(payload.decode("utf-8") or "{}")
            asset_path = str(data.get("assetPath", "")).strip()
            target_folder = resolve_asset_folder(asset_path)
            open_folder_in_explorer(target_folder)
            self.send_json_response(200, {
                "ok": True,
                "folder": str(target_folder)
            })
        except Exception as error:
            self.send_json_response(400, {
                "ok": False,
                "error": str(error)
            })

    def send_json_response(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        _, exc, _ = sys.exc_info()
        if isinstance(exc, IGNORED_SOCKET_ERRORS):
            return
        super().handle_error(request, client_address)



def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def resolve_asset_folder(asset_path):
    if not asset_path:
        raise ValueError("Nenhum asset informado.")

    parsed = urlparse(asset_path)
    normalized_path = parsed.path if parsed.scheme else asset_path
    normalized_path = normalized_path.replace("/", "\\").lstrip("\\")
    candidate = (SITE_DIR / normalized_path).resolve()
    if candidate.is_file():
        candidate = candidate.parent

    try:
        candidate.relative_to(SITE_DIR.resolve())
    except ValueError as error:
        raise ValueError("O caminho solicitado esta fora da pasta do projeto.") from error

    if not candidate.exists():
        raise FileNotFoundError(f"Pasta do asset nao encontrada: {candidate}")

    if not candidate.is_dir():
        raise NotADirectoryError(f"O caminho resolvido nao e uma pasta: {candidate}")

    return candidate


def open_folder_in_explorer(folder_path):
    subprocess.Popen(["explorer", str(folder_path)])


if not CERT_FILE.exists():
    raise FileNotFoundError(f"Certificado não encontrado: {CERT_FILE}")

if not KEY_FILE.exists():
    raise FileNotFoundError(f"Chave privada não encontrada: {KEY_FILE}")

if not SITE_DIR.exists():
    raise FileNotFoundError(f"Pasta do site não encontrada: {SITE_DIR}")

handler_class = partial(NoCacheHandler, directory=str(SITE_DIR))
httpd = QuietThreadingHTTPServer((HOST, PORT), handler_class)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

local_ip = get_local_ip()

print("HTTPS local rodando em:")
print(f"  https://localhost:{PORT}")
print(f"  https://127.0.0.1:{PORT}")
print(f"  https://{local_ip}:{PORT}")
print(f"Servindo arquivos de: {SITE_DIR}")
print(f"Usando certificado: {CERT_FILE}")
print("Pra testar no Meta Quest, abre a URL com o IP da rede local.")

httpd.serve_forever()
