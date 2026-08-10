import socket
import threading
import json
import time
import secrets
import tkinter as tk
from PIL import Image, ImageTk, ImageDraw
import qrcode
import pystray
from pystray import MenuItem as tray_item
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# --- LIBRERÍAS DE HARDWARE ---
import pyautogui
import keyboard
from pynput.mouse import Controller

pyautogui.PAUSE = 0
mouse = Controller()

# --- EVENTO DE SINCRONIZACIÓN ---
conexion_event = threading.Event()

app = FastAPI()

# --- 1. OBTENER IP LOCAL ---
def get_local_ip():
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
PORT = 8765

# --- 2. TOKEN ROTATIVO ---
TOKEN_INTERVAL = 60  # segundos entre renovaciones. Ajustá a gusto.

token_lock = threading.Lock()
current_token = None
token_generated_at = 0

def generate_token():
    return secrets.token_hex(4)  # 8 caracteres hex

def rotate_token():
    global current_token, token_generated_at
    with token_lock:
        current_token = generate_token()
        token_generated_at = time.time()
    print(f"Nuevo token generado: {current_token}")

def get_current_token():
    with token_lock:
        return current_token

def token_rotator_loop():
    # El primer token ya se generó antes de arrancar este hilo,
    # así que acá solo esperamos y renovamos.
    while True:
        time.sleep(TOKEN_INTERVAL)
        rotate_token()

# --- 3. MANEJO DE COMANDOS ---
def handle_action(payload):
    action = payload.get('action')

    if action == 'move':
        dx = payload.get('dx', 0)
        dy = payload.get('dy', 0)
        mouse.move(dx, dy)

    elif action == 'click':
        button = payload.get('button', 'left')
        pyautogui.click(button=button)

    elif action == 'keypress':
        key = payload.get('key')
        if key:
            try:
                if key.lower() == 'enter':
                    pyautogui.press('enter')
                elif key.lower() == 'backspace':
                    pyautogui.press('backspace')
                else:
                    keyboard.write(key)
            except Exception:
                pass

    elif action == 'disconnect':
        conexion_event.clear()

    elif action == 'media':
        command = payload.get('command')
        try:
            if command == 'play_pause':
                pyautogui.press('playpause')
            elif command == 'vol_up':
                pyautogui.press('volumeup')
            elif command == 'vol_down':
                pyautogui.press('volumedown')
            elif command == 'mute':
                pyautogui.press('volumemute')
            elif command == 'fullscreen':
                pyautogui.press('f')
        except Exception:
            pass

# --- 4. CONEXIÓN DEL WEBSOCKET ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token_recibido = websocket.query_params.get("token")

    if token_recibido != get_current_token():
        # Rechazamos ANTES de aceptar el handshake.
        # Código 4001 = token inválido/expirado (custom, lo interpreta la app).
        await websocket.close(code=4001)
        print("Conexión rechazada: token inválido o expirado")
        return

    await websocket.accept()
    conexion_event.set()
    print("¡Teléfono conectado exitosamente!")

    try:
        while True:
            data = await websocket.receive_json()
            handle_action(data)

    except WebSocketDisconnect:
        conexion_event.clear()
        print("El teléfono se ha desconectado.")
    except Exception:
        conexion_event.clear()


# --- 5. VENTANA EMERGENTE CON QR (TKINTER) ---
def generar_codigo_qr():
    token = get_current_token()
    ws_url = f"ws://{LOCAL_IP}:{PORT}/ws?token={token}"
    qr_data = json.dumps({"ip": LOCAL_IP, "port": PORT, "ws_url": ws_url, "token": token})
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")

def mostrar_ventana_qr():
    conexion_event.clear()

    ventana = tk.Tk()
    ventana.title("RemotePC - Conectar")
    ventana.attributes("-topmost", True)
    ventana.configure(bg="white")

    w, h = 350, 460
    screen_width = ventana.winfo_screenwidth()
    screen_height = ventana.winfo_screenheight()
    x = screen_width - w - 20
    y = screen_height - h - 60
    ventana.geometry(f"{w}x{h}+{x}+{y}")

    img = generar_codigo_qr()
    tk_img = ImageTk.PhotoImage(img)
    label_img = tk.Label(ventana, image=tk_img, bg="white")
    label_img.image = tk_img  # referencia para evitar garbage collection
    label_img.pack(pady=20)

    tk.Label(ventana, text=f"Servidor: {LOCAL_IP}:{PORT}", font=("Arial", 11, "bold"), bg="white").pack()
    tk.Label(ventana, text="Apunta la cámara de la app aquí", font=("Arial", 10), bg="white", fg="#555").pack(pady=5)

    label_estado = tk.Label(ventana, text="El código se renueva automáticamente", font=("Arial", 9), bg="white", fg="#999")
    label_estado.pack(pady=10)

    # Refresca la imagen del QR cada segundo para reflejar el token vigente
    def refrescar_qr():
        if conexion_event.is_set():
            return  # ya se va a cerrar la ventana, no seguimos refrescando
        nueva_img = generar_codigo_qr()
        nuevo_tk_img = ImageTk.PhotoImage(nueva_img)
        label_img.configure(image=nuevo_tk_img)
        label_img.image = nuevo_tk_img
        ventana.after(1000, refrescar_qr)

    ventana.after(1000, refrescar_qr)

    # Revisa si ya se conectó el teléfono, para cerrar la ventana
    def revisar_conexion():
        if conexion_event.is_set():
            ventana.destroy()
        else:
            ventana.after(300, revisar_conexion)

    revisar_conexion()
    ventana.mainloop()


# --- 6. BANDEJA DEL SISTEMA ---
def on_show_qr(icon, item):
    threading.Thread(target=mostrar_ventana_qr, daemon=True).start()

def on_quit(icon, item):
    icon.stop()
    import os
    os._exit(0)

def setup_tray():
    image = Image.new('RGB', (64, 64), color=(0, 122, 204))
    d = ImageDraw.Draw(image)
    d.rectangle([16, 16, 48, 48], fill=(255, 255, 255))

    menu = pystray.Menu(
        tray_item('Mostrar QR', on_show_qr),
        tray_item('Cerrar Servidor', on_quit)
    )
    icon = pystray.Icon("RemotePC", image, "RemotePC Server", menu)
    icon.run()


# --- 7. ARRANQUE DEL SERVIDOR ---
def start_fastapi():
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")

if __name__ == "__main__":
    print("--- Servidor RemotePC Iniciado ---")

    # 1. Generamos el primer token antes de mostrar cualquier QR
    rotate_token()

    # 2. Hilo que renueva el token cada TOKEN_INTERVAL segundos
    threading.Thread(target=token_rotator_loop, daemon=True).start()

    # 3. Levantamos el servidor web
    threading.Thread(target=start_fastapi, daemon=True).start()

    # 4. Levantamos la ventana del QR automáticamente al iniciar
    threading.Thread(target=mostrar_ventana_qr, daemon=True).start()

    # 5. La bandeja del sistema bloquea el hilo principal
    setup_tray()