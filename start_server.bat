@echo off
cd /d "%~dp0"
py -c "import http.server, socketserver, webbrowser; server = socketserver.TCPServer(('localhost', 0), http.server.SimpleHTTPRequestHandler); port = server.server_address[1]; print(f'Server running at http://localhost:{port}/'); webbrowser.open(f'http://localhost:{port}/'); server.serve_forever()"
