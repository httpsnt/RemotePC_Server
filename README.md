RemotePC - Control Remoto Local
Una solución completa cliente-servidor que transforma un dispositivo móvil (optimizado para Android 16) en un trackpad, teclado virtual y control multimedia para un PC con Windows 11. Diseñado para operar de forma segura y veloz a través de una red Wi-Fi local utilizando tecnología de WebSockets y autenticación por código QR.

🚀 Características Principales
Servidor (Python)
Zero-Config Network: Detección automática de la IP local de la red Wi-Fi.

Emparejamiento Inteligente: Generación de un código QR en una ventana emergente (Tkinter) que se auto-destruye al detectar la conexión del cliente.

Modo Silencioso: Ejecución en segundo plano con un icono en la bandeja del sistema (System Tray) para reabrir el QR o apagar el servidor.

Ultra Baja Latencia: Uso de pynput para el movimiento del cursor, eliminando el retraso artificial y logrando una fluidez nativa.

Simulación de Hardware: Uso de pyautogui y keyboard para clics precisos e inyección de pulsaciones de teclado.

Cliente Móvil (React Native / Expo)
Escáner Integrado: Acceso a la cámara nativa para escanear el QR y establecer la conexión WebSocket.

Trackpad Optimizado: Área de superficie táctil con control de estrangulamiento de red (limitado a ~60 FPS / 16ms) para evitar la saturación del router y garantizar un movimiento suave. Sensibilidad ajustada (x4) y clics por toque corto.

Teclado Remoto: Input de texto interceptado que envía pulsaciones carácter por carácter, incluyendo teclas especiales como Enter y Backspace.

Media Center: Pestaña dedicada con controles rápidos para volumen, reproducción/pausa y pantalla completa.

Gestión de Sesión: Botón de desconexión rápida que corta el WebSocket y devuelve la aplicación a la pantalla de escaneo.

🛠️ Tecnologías Utilizadas
Backend (RemotePC_Server):
Python 3.x

FastAPI & Uvicorn: Servidor ASGI de alto rendimiento.

Websockets: Comunicación bidireccional en tiempo real.

Pynput, PyAutoGUI, Keyboard: Interacción a nivel de sistema operativo (ratón y teclado).

Tkinter: Ventana emergente (Topmost).

Pystray, Pillow: Control de la bandeja del sistema de Windows.

Qrcode: Generación de matriz de datos para el emparejamiento.

Frontend (RemotePCClient):
React Native (Expo SDK 54)

Expo Camera: Escaneo de códigos QR.

React Navigation: Navegación por pestañas (Bottom Tabs).

PanResponder: Sistema nativo de React para la lectura de gestos de deslizamiento.

📦 Instalación y Configuración
1. Configurar el Servidor (PC)
Abre una terminal en la carpeta RemotePC_Server. Instala todas las dependencias necesarias ejecutando:

Bash
pip install fastapi uvicorn websockets pyautogui pynput qrcode[pil] pystray pillow keyboard
Nota de red: Asegúrate de permitir las conexiones entrantes de Python en tu Firewall de Windows (Puerto TCP 8765).

2. Configurar el Cliente (Móvil)
Abre una terminal en la carpeta RemotePCClient. Instala las dependencias respetando el bloqueo de versiones (SDK 54):

Bash
npm install --legacy-peer-deps
🎮 Modo de Uso
Arrancar el Servidor:
En la carpeta RemotePC_Server, ejecuta:

Bash
python server.py
Se abrirá automáticamente una ventana en la esquina inferior derecha con un código QR.

Arrancar la Aplicación Móvil:
En la carpeta RemotePCClient, inicia el empaquetador de Expo forzando la limpieza de caché:

Bash
npx expo@54 start -c
Abre la aplicación "Expo Go" en tu dispositivo móvil y escanea el código que aparece en la terminal de tu editor para lanzar la app.

Conectar:
Usa la cámara dentro de la app móvil recién abierta para escanear el código QR en la pantalla de tu monitor. La ventana de tu PC se cerrará automáticamente y la interfaz de control aparecerá en tu teléfono.