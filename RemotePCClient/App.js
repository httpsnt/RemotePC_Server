import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, PanResponder, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [scanned, setScanned] = useState(false); // bloquea escaneos repetidos

  // Pantalla de permisos de cámara
  if (!permission) return null; // antes devolvía undefined implícito, mejor ser explícitos
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.textPermiso}>Se necesita permiso para usar la cámara.</Text>
        <TouchableOpacity style={styles.btnPermiso} onPress={requestPermission}>
          <Text style={styles.btnText}>Conceder Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Manejar la lectura del QR
  const handleScan = ({ data }) => {
    // Log de diagnóstico: revisa la consola de Metro si algo falla
    console.log('QR escaneado (raw):', JSON.stringify(data));

    if (scanned || isConnected) return; // evita múltiples disparos/conexiones

    // El servidor manda un JSON: {"ip":..., "port":..., "ws_url":"ws://...", "token":"..."}
    // No una URL "ws://" cruda. Hay que parsearlo primero.
    let url = null;
    const raw = (data || '').trim();

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ws_url === 'string') {
        url = parsed.ws_url;
      }
    } catch (e) {
      // Por si en algún momento el QR sí trae una URL cruda en vez de JSON
      if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
        url = raw;
      }
    }

    if (!url || (!url.startsWith('ws://') && !url.startsWith('wss://'))) {
      Alert.alert('QR inválido', `El código escaneado no contiene una URL de WebSocket válida:\n${raw}`);
      return; // no bloqueamos el escáner, para permitir reintentar con otro QR
    }

    setScanned(true); // bloquea nuevos escaneos mientras se intenta conectar

    try {
      const socket = new WebSocket(url);

      socket.onopen = () => {
        console.log('WebSocket conectado a', url);
        setIsConnected(true);
        setWs(socket);
        Alert.alert('¡Conectado!', 'Ya puedes controlar tu PC.');
      };

      socket.onclose = (e) => {
        console.log('WebSocket cerrado:', e?.code, e?.reason);
        setIsConnected(false);
        setWs(null);
        setScanned(false); // permite volver a escanear

        if (e?.code === 4001) {
          // Código custom que manda el servidor cuando el token venció o es inválido
          Alert.alert('QR expirado', 'El código venció o ya fue usado. Escanea el QR actualizado en la pantalla de tu PC.');
        } else if (isConnected) {
          // Solo avisamos "se perdió la conexión" si llegamos a estar conectados
          Alert.alert('Desconectado', 'Se perdió la conexión con el servidor.');
        }
      };

      socket.onerror = (e) => {
        console.log('WebSocket error:', e?.message);
        setIsConnected(false);
        setWs(null);
        setScanned(false); // permite reintentar
        Alert.alert('Error de Red', 'No se pudo alcanzar el servidor. Revisa el Firewall de Windows.');
      };
    } catch (e) {
      // new WebSocket() puede lanzar una excepción síncrona si la URL está mal formada
      console.log('Excepción al crear WebSocket:', e);
      setScanned(false);
      Alert.alert('Error', 'No se pudo iniciar la conexión con esa URL.');
    }
  };

  // Función global para enviar comandos al servidor Python
  const sendCommand = (payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      console.log('sendCommand ignorado, WebSocket no está abierto:', payload);
    }
  };

  // Función para desconectar manualmente y volver al escáner
  const disconnect = () => {
    if (ws) {
      ws.close();
    }
    setIsConnected(false);
    setWs(null);
    setScanned(false);
  };

  // Si no hay conexión, mostrar el escáner QR
  if (!isConnected) {
    return (
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          onBarcodeScanned={scanned ? undefined : handleScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          <Text style={styles.scanText}>
            {scanned ? 'Conectando...' : 'Apunta al QR de tu PC'}
          </Text>
        </View>
      </View>
    );
  }

  // Si está conectado, mostrar la interfaz de control
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1c1c1e' },
          headerTintColor: '#fff',
          tabBarStyle: { backgroundColor: '#1c1c1e', borderTopWidth: 0 },
          tabBarActiveTintColor: '#0a84ff',
        }}
      >
        <Tab.Screen name="Trackpad">
          {() => <TrackpadScreen sendCommand={sendCommand} onDisconnect={disconnect} />}
        </Tab.Screen>
        <Tab.Screen name="Media Center">
          {() => <MediaScreen sendCommand={sendCommand} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- PESTAÑA 1: TRACKPAD Y TECLADO ---
function TrackpadScreen({ sendCommand, onDisconnect }) {
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastMoveTime = useRef(0);

  // Trackpad con limitador anti-lag (60fps aprox) y sensibilidad x4
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lastX.current = 0;
        lastY.current = 0;
      },
      onPanResponderMove: (evt, gestureState) => {
        const now = Date.now();
        if (now - lastMoveTime.current > 16) {
          const dx = gestureState.dx - lastX.current;
          const dy = gestureState.dy - lastY.current;
          sendCommand({ action: 'move', dx: dx * 4, dy: dy * 4 });
          lastMoveTime.current = now;
          lastX.current = gestureState.dx;
          lastY.current = gestureState.dy;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) < 3 && Math.abs(gestureState.dy) < 3) {
          sendCommand({ action: 'click', button: 'left' });
        }
      },
    })
  ).current;

  const handleLogout = () => {
    sendCommand({ action: 'disconnect' });
    if (onDisconnect) onDisconnect(); // vuelve a la pantalla de escaneo
  };

  return (
    <View style={styles.tabContainer}>
      {/* Botón de Cerrar Sesión en la parte superior */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>

      {/* Teclado virtual */}
      <TextInput
        placeholder="Toca para escribir en el PC..."
        placeholderTextColor="#888"
        style={styles.input}
        onSubmitEditing={() => sendCommand({ action: 'keypress', key: 'Enter' })}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === 'Backspace') {
            sendCommand({ action: 'keypress', key: 'Backspace' });
          } else {
            sendCommand({ action: 'keypress', key: nativeEvent.key });
          }
        }}
      />

      {/* Superficie táctil */}
      <View style={styles.trackpad} {...panResponder.panHandlers}>
        <Text style={styles.trackpadText}>Área del Trackpad</Text>
        <Text style={styles.trackpadSub}>Desliza para mover, toca para clic</Text>
      </View>
    </View>
  );
}

// --- PESTAÑA 2: MEDIA CENTER ---
function MediaScreen({ sendCommand }) {
  const MediaButton = ({ title, cmd, color = '#3a3a3c' }) => (
    <TouchableOpacity
      style={[styles.mediaBtn, { backgroundColor: color }]}
      onPress={() => sendCommand({ action: 'media', command: cmd })}
    >
      <Text style={styles.mediaBtnText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.mediaContainer}>
      <MediaButton title="⏯️ Reproducir / Pausa" cmd="play_pause" color="#0a84ff" />
      <MediaButton title="🔊 Subir Volumen" cmd="vol_up" />
      <MediaButton title="🔉 Bajar Volumen" cmd="vol_down" />
      <MediaButton title="🔇 Silenciar" cmd="mute" />
      <MediaButton title="📺 Pantalla Completa" cmd="fullscreen" />
    </View>
  );
}

// --- ESTILOS VISUALES (Dark Mode) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  textPermiso: { color: '#fff', fontSize: 16, marginBottom: 20 },
  btnPermiso: { backgroundColor: '#0a84ff', padding: 15, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  camera: { flex: 1 },
  overlay: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  scanText: {
    color: '#fff',
    fontSize: 18,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tabContainer: { flex: 1, padding: 20, backgroundColor: '#000' },
  input: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 16,
  },
  trackpad: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  trackpadText: { color: '#555', fontSize: 24, fontWeight: 'bold' },
  trackpadSub: { color: '#444', fontSize: 14, marginTop: 10 },
  mediaContainer: { flex: 1, padding: 20, backgroundColor: '#000', justifyContent: 'center' },
  mediaBtn: {
    padding: 25,
    borderRadius: 15,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  mediaBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoutButton: {
    backgroundColor: '#ff4444',
    padding: 10,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginBottom: 10,
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});