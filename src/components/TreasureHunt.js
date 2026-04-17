import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert, Vibration } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { initDatabase, saveTreasures, getTreasures, markAsFound } from '../database/database';
import { getDistance, generateRandomCoordinates } from '../utils/geoUtils';

// Configuración de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function TreasureHunt() {
  const [db, setDb] = useState(null);
  const [location, setLocation] = useState(null);
  const [treasures, setTreasures] = useState([]);
  const [activeTreasure, setActiveTreasure] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Inicializando...');
  const [isCapturable, setIsCapturable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const locationSubscription = useRef(null);
  const notifiedTreasureId = useRef(null);

  useEffect(() => {
    setupGame();
    requestPermissions();
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      // Verificamos si es un dispositivo físico (las notificaciones fallan en simuladores)
      if (!Constants.expoConfig) return;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Permisos de notificación no concedidos');
      }
    } catch (error) {
      // Silenciamos el error de Expo Go sobre notificaciones remotas
      console.log('Notificaciones locales activas (Advertencia de Push ignorada)');
    }
  };

  const setupGame = async () => {
    try {
      const database = await initDatabase();
      setDb(database);

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permiso de ubicación denegado');
        setLoading(false);
        return;
      }

      let initialLocation = await Location.getCurrentPositionAsync({});
      setLocation(initialLocation.coords);

      let savedTreasures = await getTreasures(database);
      
      if (savedTreasures.length === 0) {
        const newTreasures = generateRandomCoordinates(
          initialLocation.coords.latitude,
          initialLocation.coords.longitude,
          50 // Radio de 50 metros
        );
        await saveTreasures(database, newTreasures);
        savedTreasures = await getTreasures(database);
      }

      setTreasures(savedTreasures);
      updateActiveTreasure(savedTreasures, initialLocation.coords);
      
      startWatchingLocation();
      setLoading(false);
    } catch (error) {
      console.error(error);
      setErrorMsg('Error al iniciar el juego');
      setLoading(false);
    }
  };

  const startWatchingLocation = async () => {
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 2,
      },
      (newLocation) => {
        const coords = newLocation.coords;
        setLocation(coords);
        checkProximity(coords);
      }
    );
  };

  const updateActiveTreasure = (allTreasures, currentCoords) => {
    const pending = allTreasures.filter(t => t.encontrado === 0);
    
    if (pending.length === 0) {
      setActiveTreasure(null);
      setIsCapturable(false);
      setStatusMsg('¡Juego completado! Has encontrado todos los tesoros.');
      return;
    }

    let closest = pending[0];
    let minDistance = getDistance(
      currentCoords.latitude,
      currentCoords.longitude,
      closest.latitude,
      closest.longitude
    );

    pending.forEach(t => {
      const dist = getDistance(
        currentCoords.latitude,
        currentCoords.longitude,
        t.latitude,
        t.longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        closest = t;
      }
    });

    setActiveTreasure(closest);
    
    // Reset proximity flag for the new active treasure
    const dist = getDistance(
      currentCoords.latitude,
      currentCoords.longitude,
      closest.latitude,
      closest.longitude
    );
    
    const capturable = dist < 30;
    setIsCapturable(capturable);
    setStatusMsg(capturable ? '¡Tesoro listo para capturar!' : 'Buscando tesoro...');
  };

  const checkProximity = (coords) => {
    if (!activeTreasure) return;

    const dist = getDistance(
      coords.latitude,
      coords.longitude,
      activeTreasure.latitude,
      activeTreasure.longitude
    );

    const currentlyCapturable = dist < 30;

    if (currentlyCapturable && !isCapturable) {
      // Entró en rango por primera vez para este tesoro
      handleEnterRange();
    }

    setIsCapturable(currentlyCapturable);
    if (currentlyCapturable) {
      setStatusMsg('¡Tesoro listo para capturar!');
    } else {
      setStatusMsg('Buscando tesoro...');
    }
  };

  const handleEnterRange = async () => {
    if (notifiedTreasureId.current !== activeTreasure.id) {
      try {
        Vibration.vibrate();
        
        // Programamos la notificación local
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "¡Tesoro encontrado cerca! 💰",
            body: "Tócalo en el mapa para capturarlo.",
            sound: true, // Esto activa el sonido local
          },
          trigger: null, // null significa "ahora mismo"
        });
        
        notifiedTreasureId.current = activeTreasure.id;
      } catch (e) {
        console.log("Error al lanzar notificación local:", e);
      }
    }
  };

  const handleMarkerPress = () => {
    if (isCapturable) {
      handleTreasureFound(activeTreasure.id);
    } else {
      Alert.alert('Muy lejos', 'Debes acercarte más para capturarlo.');
    }
  };

  const handleTreasureFound = async (id) => {
    if (!db) return;
    
    await markAsFound(db, id);
    const updatedTreasures = await getTreasures(db);
    setTreasures(updatedTreasures);
    
    Alert.alert('¡Tesoro Capturado!', 'Has guardado el tesoro en tu colección.');
    setStatusMsg('Tesoro capturado');
    updateActiveTreasure(updatedTreasures, location);
  };

  const foundCount = treasures.filter(t => t.encontrado === 1).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Cargando aventura...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }}
        showsUserLocation={true}
        followsUserLocation={true}
      >
        {activeTreasure && (
          <Marker
            coordinate={{
              latitude: activeTreasure.latitude,
              longitude: activeTreasure.longitude,
            }}
            onPress={handleMarkerPress}
            pinColor={isCapturable ? "green" : "gold"}
          >
            <View style={[styles.markerContainer, isCapturable && styles.markerCapturable]}>
              <Text style={styles.markerEmoji}>{isCapturable ? '🎁' : '💰'}</Text>
            </View>
          </Marker>
        )}
      </MapView>

      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.counterText}>Tesoros encontrados: {foundCount}/3</Text>
          <Text style={[styles.statusText, isCapturable && styles.statusCapturable]}>
            {statusMsg}
          </Text>
          {activeTreasure && location && (
            <Text style={styles.distanceText}>
              Estás a {getDistance(location.latitude, location.longitude, activeTreasure.latitude, activeTreasure.longitude).toFixed(0)}m
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlay: { position: 'absolute', bottom: 40, left: 20, right: 20, alignItems: 'center' },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 20,
    width: '100%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  counterText: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#333' },
  statusText: { fontSize: 16, textAlign: 'center', marginTop: 8, color: '#666', fontWeight: '500' },
  statusCapturable: { color: '#4CAF50', fontWeight: 'bold' },
  distanceText: { fontSize: 14, textAlign: 'center', marginTop: 8, color: '#007AFF' },
  markerContainer: {
    padding: 8,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'gold',
  },
  markerCapturable: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  markerEmoji: { fontSize: 20 },
  errorText: { color: 'red', fontSize: 16, textAlign: 'center' },
});
