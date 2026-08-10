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

  // Pantalla de permisos de cámara
  if (!permission) return ;
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
    if (data.startsWith('ws://') && !isConnected) {
      const socket = new WebSocket(data);
      
      socket.onopen = () => {
        setIsConnected(true);
        setWs(socket);
        Alert.alert("¡Conectado!", "Ya puedes controlar tu PC.");
      };
      
      socket.onclose = () => {
        setIsConnected(false);
        setWs(null);
        Alert.alert("Desconectado", "Se perdió la conexión con el servidor.");
      };
      
      socket.onerror = () => {
        Alert.alert("Error de Red", "No se pudo alcanzar el servidor. Revisa el Firewall de Windows.");
      };
    }
  };

  // Función global para enviar comandos al servidor Python
  const sendCommand = (payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  // Si no hay conexión, mostrar el escáner QR
  if (!isConnected) {
    return (
      <View style={styles.container}>
        <CameraView 
          style={styles.camera} 
          onBarcodeScanned={handleScan} 
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }} 
        />
        <View style={styles.overlay}>
          <Text style={styles.scanText}>Apunta al QR de tu PC</Text>
        </View>
      </View>
    );
  }

  // Si está conectado, mostrar la interfaz de control
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ 
        headerStyle: { backgroundColor: '#1c1c1e' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#1c1c1e', borderTopWidth: 0 },
        tabBarActiveTintColor: '#0a84ff'
      }}>
        <Tab.Screen name="Trackpad" children={() => <TrackpadScreen sendCommand={sendCommand} />} />
        <Tab.Screen name="Media Center" children={() => <MediaScreen sendCommand={sendCommand} />} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- PESTAÑA 1: TRACKPAD Y TECLADO ---
function TrackpadScreen({ sendCommand }) {
  let lastX = 0;
  let lastY = 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lastX = 0; lastY = 0;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Calcular la diferencia (delta) desde el último frame para un movimiento fluido
        const dx = gestureState.dx - lastX;
        const dy = gestureState.dy - lastY;
        lastX = gestureState.dx;
        lastY = gestureState.dy;
        sendCommand({ action: 'move', dx: dx * 1.5, dy: dy * 1.5 }); // Multiplicador de sensibilidad
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Si no se movió casi nada, se considera un clic
        if (Math.abs(gestureState.dx) < 3 && Math.abs(gestureState.dy) < 3) {
           sendCommand({ action: 'click', button: 'left' });
        }
      }
    })
  ).current;

  return (
    <View style={styles.tabContainer}>
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
    <TouchableOpacity style={[styles.mediaBtn, { backgroundColor: color }]} onPress={() => sendCommand({ action: 'media', command: cmd })}>
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
  scanText: { color: '#fff', fontSize: 18, backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 10, overflow: 'hidden' },
  tabContainer: { flex: 1, padding: 20, backgroundColor: '#000' },
  input: { backgroundColor: '#1c1c1e', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, fontSize: 16 },
  trackpad: { flex: 1, backgroundColor: '#1c1c1e', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  trackpadText: { color: '#555', fontSize: 24, fontWeight: 'bold' },
  trackpadSub: { color: '#444', fontSize: 14, marginTop: 10 },
  mediaContainer: { flex: 1, padding: 20, backgroundColor: '#000', justifyContent: 'center' },
  mediaBtn: { padding: 25, borderRadius: 15, marginBottom: 15, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5 },
  mediaBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});