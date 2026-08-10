import asyncio
import json
import socket
import secrets
import threading
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
import pyautogui
import keyboard
import qrcode
import pystray
from PIL import Image, ImageDraw

# Desactivar el failsafe de pyautogui para evitar que el servidor 
# se caiga si mueves el cursor muy fuerte hacia una esquina.
pyautogui.FAILSAFE = False

app = FastAPI()

# 1. Autenticación y Red
TOKEN = secrets.token_hex(4)  # Genera un PIN alfanumérico seguro de 8 caracteres
PORT = 8000

def get_local_ip():
    """Obtiene la IP local de tu PC en la red Wi-Fi."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

LOCAL_IP = get_local_ip()

# 2. Endpoint del WebSocket (El puente de comunicación)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    # Validar el token de seguridad
    if token != TOKEN:
        await websocket.close(code=1008) # Violación de política
        print("Intento de conexión bloqueado: Token inválido.")
        return
        
    await websocket.accept()
    print("¡Teléfono conectado exitosamente!")
    
    try:
        while True:
            # Esperar mensajes del teléfono
            data = await websocket.receive_text()
            payload = json.loads(data)
            handle_action(payload)
    except WebSocketDisconnect:
        print("Teléfono desconectado.")

# 3. Procesador de Comandos (Traduciendo JSON a acciones de Windows)
def handle_action(payload):
    action = payload.get("action")
    
    if action == "move":
        # Mover el mouse relativo a su posición actual
        pyautogui.move(payload.get("dx", 0), payload.get("dy", 0))
        
    elif action == "click":
        button = payload.get("button", "left")
        pyautogui.click(button=button)
        
    elif action == "keypress":
        key = payload.get("key")
        if key == "Enter":
            keyboard.send("enter")
        elif key == "Backspace":
            keyboard.send("backspace")
        else:
            keyboard.write(key)
            
    elif action == "media":
        cmd = payload.get("command")
        if cmd == "play_pause":
            keyboard.send("play/pause media")
        elif cmd == "vol_up":
            keyboard.send("volume up")
        elif cmd == "vol_down":
            keyboard.send("volume down")
        elif cmd == "mute":
            keyboard.send("volume mute")
        elif cmd == "fullscreen":
            keyboard.send("f11")

# 4. Funciones de la Bandeja del Sistema (pystray) y QR
def show_qr():
    """Genera y muestra el Código QR temporalmente."""
    uri = f"ws://{LOCAL_IP}:{PORT}/ws?token={TOKEN}"
    img = qrcode.make(uri)
    # Abre la imagen con el visor predeterminado de Windows
    img.show() 

def create_tray_icon_image():
    """Crea un icono simple para la bandeja del sistema."""
    image = Image.new('RGB', (64, 64), color=(40, 40, 40))
    d = ImageDraw.Draw(image)
    d.text((12, 22), "PC", fill=(0, 255, 128))
    return image

def on_quit(icon, item):
    """Cierra el servidor de forma segura."""
    icon.stop()
    os._exit(0) # Forzamos el cierre de todos los hilos (incluyendo FastAPI)

def setup_tray():
    """Configura el icono junto al reloj de Windows."""
    menu = pystray.Menu(
        pystray.MenuItem(f"IP: {LOCAL_IP}", lambda: None, enabled=False),
        pystray.MenuItem("Mostrar QR", lambda: show_qr()),
        pystray.MenuItem("Salir", on_quit)
    )
    icon = pystray.Icon("RemotePC", create_tray_icon_image(), "Control Remoto Activo", menu)
    icon.run()

# 5. Arranque del Servidor
def run_server():
    """Ejecuta FastAPI sin bloquear la interfaz."""
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")

if __name__ == "__main__":
    # Iniciar el servidor web en un hilo secundario
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Iniciar el icono de la bandeja en el hilo principal (requerido por Windows)
    setup_tray()
