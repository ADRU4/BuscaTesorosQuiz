import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Animated,
    Dimensions,
    Easing,
    Modal,
    StyleSheet, Text,
    TouchableOpacity,
    Vibration,
    View
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { getTreasures, initDatabase, markAsFound, resetGame, saveTreasures, updateTreasureLocation } from '../database/database';
import { generateRandomCoordinates, getDistance } from '../utils/geoUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_TREASURES = 5;
const CAPTURE_RADIUS = 30;

const DIFFICULTIES = {
  facil: { label: 'Fácil', radius: 100, timer: null, color: '#4CAF50' },
  normal: { label: 'Normal', radius: 1000, timer: null, color: '#2196F3' },
  dificil: { label: 'Difícil', radius: 2000, timer: 180, color: '#F44336' },
};

const TREASURE_TYPES = [
  { emoji: '💎', name: 'Diamante', color: '#E3F2FD', border: '#42A5F5' },
  { emoji: '👑', name: 'Corona', color: '#FFF8E1', border: '#FFD54F' },
  { emoji: '🏆', name: 'Trofeo', color: '#FFF3E0', border: '#FFB74D' },
  { emoji: '💰', name: 'Cofre', color: '#F3E5F5', border: '#CE93D8' },
  { emoji: '🔮', name: 'Cristal', color: '#E8F5E9', border: '#81C784' },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Particle component for capture celebration
function CaptureParticles({ visible, onFinish }) {
  const particles = useRef(
    Array.from({ length: 12 }, () => ({
      anim: new Animated.Value(0),
      angle: Math.random() * Math.PI * 2,
      distance: 60 + Math.random() * 80,
      emoji: ['✨', '🌟', '⭐', '💫', '🎉', '🎊'][Math.floor(Math.random() * 6)],
    }))
  ).current;

  useEffect(() => {
    if (visible) {
      const animations = particles.map((p, i) =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: 800 + i * 50,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
          delay: i * 30,
        })
      );
      Animated.parallel(animations).start(() => {
        particles.forEach(p => p.anim.setValue(0));
        onFinish?.();
      });
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => {
        const translateX = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [SCREEN_WIDTH / 2, SCREEN_WIDTH / 2 + Math.cos(p.angle) * p.distance],
        });
        const translateY = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [Dimensions.get('window').height / 2, Dimensions.get('window').height / 2 + Math.sin(p.angle) * p.distance - 100],
        });
        const opacity = p.anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 1, 0],
        });
        const scale = p.anim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.2, 1.5, 0.5],
        });
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute',
              fontSize: 24,
              transform: [{ translateX }, { translateY }, { scale }],
              opacity,
            }}
          >
            {p.emoji}
          </Animated.Text>
        );
      })}
    </View>
  );
}

export default function TreasureHunt() {
  const [db, setDb] = useState(null);
  const [location, setLocation] = useState(null);
  const [treasures, setTreasures] = useState([]);
  const [activeTreasure, setActiveTreasure] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Inicializando...');
  const [isCapturable, setIsCapturable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showParticles, setShowParticles] = useState(false);
  const [lastCapturedType, setLastCapturedType] = useState(null);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [difficulty, setDifficulty] = useState(null);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);

  const locationSubscription = useRef(null);
  const notifiedTreasureId = useRef(null);
  const timerRef = useRef(null);

  // Timer logic for Hard difficulty
  useEffect(() => {
    if (isTimerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerActive) {
      handleGameOver();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerActive, timeLeft]);

  const handleGameOver = () => {
    setIsTimerActive(false);
    Alert.alert(
      '⌛ ¡Tiempo agotado!',
      'No lograste encontrar todos los tesoros a tiempo. ¡Inténtalo de nuevo!',
      [{ text: 'Reiniciar', onPress: () => handleResetGame() }]
    );
  };

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const captureScaleAnim = useRef(new Animated.Value(1)).current;
  const captureOpacityAnim = useRef(new Animated.Value(1)).current;
  const cardSlideAnim = useRef(new Animated.Value(100)).current;
  const loadingRotate = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const celebrationAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for capturable marker
  useEffect(() => {
    if (isCapturable) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isCapturable]);

  // Card slide-in animation
  useEffect(() => {
    if (!loading) {
      Animated.spring(cardSlideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  // Loading spinner animation
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(loadingRotate, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [loading]);

  // Progress bar animation
  useEffect(() => {
    const foundCount = treasures.filter(t => t.encontrado === 1).length;
    Animated.spring(progressAnim, {
      toValue: foundCount / TOTAL_TREASURES,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [treasures]);

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
        setShowDifficultyModal(true);
      } else {
        setTreasures(savedTreasures);
        updateActiveTreasure(savedTreasures, initialLocation.coords);
      }

      startWatchingLocation();
      setLoading(false);
    } catch (error) {
      console.error(error);
      setErrorMsg('Error al iniciar el juego');
      setLoading(false);
    }
  };

  const handleStartWithDifficulty = async (diffKey) => {
    const diff = DIFFICULTIES[diffKey];
    setDifficulty(diffKey);
    setShowDifficultyModal(false);

    if (diff.timer) {
      setTimeLeft(diff.timer);
      setIsTimerActive(true);
    }

    const newTreasures = generateRandomCoordinates(
      location.latitude,
      location.longitude,
      diff.radius,
      TOTAL_TREASURES
    );
    await saveTreasures(db, newTreasures);
    const savedTreasures = await getTreasures(db);
    setTreasures(savedTreasures);
    updateActiveTreasure(savedTreasures, location);

    Alert.alert('Dificultad seleccionada', `Has elegido el modo ${diff.label}.`);
  };

  const startWatchingLocation = async () => {
    locationSubscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 2 },
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
      setGameCompleted(true);
      setIsTimerActive(false);
      setStatusMsg('Has encontrado todos los tesoros');
      return;
    }

    setGameCompleted(false);
    let closest = pending[0];
    let minDistance = getDistance(
      currentCoords.latitude, currentCoords.longitude,
      closest.latitude, closest.longitude
    );

    pending.forEach(t => {
      const dist = getDistance(
        currentCoords.latitude, currentCoords.longitude,
        t.latitude, t.longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        closest = t;
      }
    });

    setActiveTreasure(closest);

    const capturable = minDistance < CAPTURE_RADIUS;
    setIsCapturable(capturable);
    setStatusMsg(capturable ? '¡Toca el tesoro para capturarlo!' : 'Sigue el mapa hacia el tesoro...');
  };

  const checkProximity = (coords) => {
    if (!activeTreasure) return;

    const dist = getDistance(
      coords.latitude, coords.longitude,
      activeTreasure.latitude, activeTreasure.longitude
    );

    const currentlyCapturable = dist < CAPTURE_RADIUS;

    if (currentlyCapturable && !isCapturable) {
      handleEnterRange();
    }

    setIsCapturable(currentlyCapturable);
    if (currentlyCapturable) {
      setStatusMsg('¡Toca el tesoro para capturarlo!');
    } else if (dist < 100) {
      setStatusMsg('¡Te estás acercando! Casi llegas...');
    } else {
      setStatusMsg('Sigue el mapa hacia el tesoro...');
    }
  };

  const handleEnterRange = async () => {
    if (notifiedTreasureId.current !== activeTreasure.id) {
      try {
        Vibration.vibrate([0, 200, 100, 200]);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "¡Tesoro detectado! 💎",
            body: "Estás muy cerca. Toca el marcador para capturarlo.",
            sound: true,
          },
          trigger: null,
        });
        notifiedTreasureId.current = activeTreasure.id;
      } catch (e) {
        console.log("Error al lanzar notificación local:", e);
      }
    }
  };

  const playCaptureAnimation = () => {
    setShowParticles(true);

    // Scale bounce
    captureScaleAnim.setValue(1);
    captureOpacityAnim.setValue(1);
    Animated.sequence([
      Animated.spring(captureScaleAnim, {
        toValue: 2.5,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(captureScaleAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(captureOpacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      captureScaleAnim.setValue(1);
      captureOpacityAnim.setValue(1);
    });

    // Celebration banner
    celebrationAnim.setValue(0);
    Animated.sequence([
      Animated.spring(celebrationAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(celebrationAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleMarkerPress = () => {
    if (isCapturable) {
      handleTreasureFound(activeTreasure.id);
    } else {
      Alert.alert('Muy lejos', 'Acércate más al tesoro para poder capturarlo.');
    }
  };

  const handleTreasureFound = async (id) => {
    if (!db) return;

    const treasureIndex = treasures.findIndex(t => t.id === id);
    const capturedType = TREASURE_TYPES[treasureIndex % TREASURE_TYPES.length];
    setLastCapturedType(capturedType);

    Vibration.vibrate([0, 100, 50, 100, 50, 200]);
    playCaptureAnimation();

    await markAsFound(db, id);
    const updatedTreasures = await getTreasures(db);
    setTreasures(updatedTreasures);

    const found = updatedTreasures.filter(t => t.encontrado === 1).length;

    if (found === TOTAL_TREASURES) {
      setIsTimerActive(false);
      setTimeout(() => {
        Alert.alert(
          '🏆 ¡Felicidades!',
          `¡Has encontrado los ${TOTAL_TREASURES} tesoros!\n\nEres un verdadero cazador de tesoros.`,
          [{ text: '¡Genial!' }]
        );
      }, 1200);
    }

    updateActiveTreasure(updatedTreasures, location);
  };

  const handleRelocateTreasure = async () => {
    if (!db || !activeTreasure || !location) return;

    try {
      const [newCoords] = generateRandomCoordinates(
        location.latitude, location.longitude, 100, 1
      );

      await updateTreasureLocation(db, activeTreasure.id, newCoords.latitude, newCoords.longitude);
      const updatedTreasures = await getTreasures(db);
      setTreasures(updatedTreasures);
      updateActiveTreasure(updatedTreasures, location);

      Alert.alert('Tesoro reubicado', 'El tesoro apareció en una nueva ubicación.');
    } catch (error) {
      console.error('Error al reubicar:', error);
      Alert.alert('Error', 'No se pudo reubicar el tesoro.');
    }
  };

  const handleResetGame = async () => {
    if (!db || !location) return;

    Alert.alert(
      'Nueva aventura',
      '¿Quieres empezar una nueva búsqueda del tesoro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Empezar',
          onPress: async () => {
            await resetGame(db);
            setTreasures([]);
            setGameCompleted(false);
            notifiedTreasureId.current = null;
            setIsTimerActive(false);
            setTimeLeft(0);
            setDifficulty(null);
            setShowDifficultyModal(true);
          },
        },
      ]
    );
  };

  const foundCount = treasures.filter(t => t.encontrado === 1).length;

  const getTreasureType = (index) => TREASURE_TYPES[index % TREASURE_TYPES.length];

  const getDirectionArrow = () => {
    if (!location || !activeTreasure) return '';
    const dLat = activeTreasure.latitude - location.latitude;
    const dLon = activeTreasure.longitude - location.longitude;
    const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return '⬆️';
    if (angle >= 22.5 && angle < 67.5) return '↗️';
    if (angle >= 67.5 && angle < 112.5) return '➡️';
    if (angle >= 112.5 && angle < 157.5) return '↘️';
    if (angle >= 157.5 || angle < -157.5) return '⬇️';
    if (angle >= -157.5 && angle < -112.5) return '↙️';
    if (angle >= -112.5 && angle < -67.5) return '⬅️';
    return '↖️';
  };

  // --- LOADING SCREEN ---
  if (loading) {
    const spin = loadingRotate.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <Animated.Text style={[styles.loadingEmoji, { transform: [{ rotate: spin }] }]}>
            💎
          </Animated.Text>
          <Text style={styles.loadingTitle}>Busca Tesoros</Text>
          <Text style={styles.loadingSubtitle}>Preparando tu aventura...</Text>
          <ActivityIndicator size="small" color="#7C4DFF" style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  // --- ERROR SCREEN ---
  if (errorMsg) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 48 }}>😕</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={setupGame}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeTreasureIndex = activeTreasure
    ? treasures.findIndex(t => t.id === activeTreasure.id)
    : 0;
  const currentType = getTreasureType(activeTreasureIndex);
  const distance = activeTreasure && location
    ? getDistance(location.latitude, location.longitude, activeTreasure.latitude, activeTreasure.longitude)
    : null;

  const celebrationScale = celebrationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const celebrationOpacity = celebrationAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <View style={styles.container}>
      <Modal visible={showDifficultyModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.difficultyCard}>
            <Text style={styles.modalTitle}>Elige la Dificultad</Text>
            <Text style={styles.modalSubtitle}>¿Qué tan lejos quieres buscar?</Text>

            {Object.keys(DIFFICULTIES).map((key) => {
              const diff = DIFFICULTIES[key];
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.difficultyButton, { borderColor: diff.color }]}
                  onPress={() => handleStartWithDifficulty(key)}
                >
                  <Text style={[styles.difficultyButtonText, { color: diff.color }]}>
                    {diff.label}
                  </Text>
                  <Text style={styles.difficultyDescription}>
                    {key === 'facil' ? 'Cerca de ti (<100m)' : 'En cualquier lugar'}
                    {diff.timer ? ` • ${diff.timer / 60} min` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

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
        showsCompass={true}
        showsMyLocationButton={false}
      >
        {activeTreasure && (
          <Marker
            coordinate={{
              latitude: activeTreasure.latitude,
              longitude: activeTreasure.longitude,
            }}
            onPress={handleMarkerPress}
          >
            <Animated.View
              style={[
                styles.markerOuter,
                {
                  borderColor: isCapturable ? '#4CAF50' : currentType.border,
                  backgroundColor: isCapturable ? '#C8E6C9' : currentType.color,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Animated.Text
                style={[
                  styles.markerEmoji,
                  {
                    transform: [{ scale: captureScaleAnim }],
                    opacity: captureOpacityAnim,
                  },
                ]}
              >
                {isCapturable ? '🎁' : currentType.emoji}
              </Animated.Text>
            </Animated.View>
          </Marker>
        )}
      </MapView>

      {/* Header with treasure counter dots */}
      <View style={styles.headerOverlay}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>🗺️ Busca Tesoros</Text>
            {difficulty && (
              <View style={[styles.difficultyBadge, { backgroundColor: DIFFICULTIES[difficulty].color }]}>
                <Text style={styles.difficultyBadgeText}>{DIFFICULTIES[difficulty].label}</Text>
              </View>
            )}
          </View>
          <View style={styles.dotsRow}>
            {treasures.map((t, i) => {
              const type = getTreasureType(i);
              return (
                <View
                  key={t.id}
                  style={[
                    styles.dot,
                    t.encontrado === 1
                      ? { backgroundColor: type.border }
                      : { backgroundColor: '#E0E0E0' },
                    activeTreasure?.id === t.id && t.encontrado === 0 && styles.dotActive,
                  ]}
                >
                  <Text style={styles.dotEmoji}>
                    {t.encontrado === 1 ? '✓' : type.emoji}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Bottom info card */}
      <Animated.View style={[styles.overlay, { transform: [{ translateY: cardSlideAnim }] }]}>
        <View style={styles.card}>
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {foundCount} de {TOTAL_TREASURES} tesoros encontrados
          </Text>

          {/* Timer for Hard mode */}
          {difficulty === 'dificil' && isTimerActive && (
            <View style={styles.timerRow}>
              <Text style={[styles.timerText, timeLeft <= 30 && { color: '#F44336' }]}>
                ⏱️ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </Text>
            </View>
          )}

          {/* Status message */}
          <Text style={[styles.statusText, isCapturable && styles.statusCapturable]}>
            {isCapturable ? '✨ ' : ''}{statusMsg}
          </Text>

          {/* Distance + direction */}
          {activeTreasure && distance !== null && (
            <View style={styles.distanceRow}>
              <Text style={styles.directionArrow}>{getDirectionArrow()}</Text>
              <Text style={styles.distanceText}>{distance.toFixed(0)}m</Text>
              {distance < CAPTURE_RADIUS && (
                <View style={styles.captureHint}>
                  <Text style={styles.captureHintText}>¡CAPTURA!</Text>
                </View>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.buttonsRow}>
            {activeTreasure && (
              <TouchableOpacity style={styles.relocateButton} onPress={handleRelocateTreasure}>
                <Text style={styles.relocateButtonText}>📍 Reubicar</Text>
              </TouchableOpacity>
            )}
            {gameCompleted && (
              <TouchableOpacity style={styles.resetButton} onPress={handleResetGame}>
                <Text style={styles.resetButtonText}>🔄 Nueva aventura</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Celebration banner */}
      <Animated.View
        style={[
          styles.celebrationBanner,
          { transform: [{ scale: celebrationScale }], opacity: celebrationOpacity },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.celebrationText}>
          {lastCapturedType ? `${lastCapturedType.emoji} ¡${lastCapturedType.name} capturado!` : '¡Tesoro capturado!'}
        </Text>
      </Animated.View>

      {/* Capture particles */}
      <CaptureParticles visible={showParticles} onFinish={() => setShowParticles(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F0FF',
  },
  loadingContent: { alignItems: 'center' },
  loadingEmoji: { fontSize: 64, marginBottom: 16 },
  loadingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#4A148C',
    letterSpacing: 1,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: '#7C4DFF',
    marginTop: 8,
  },
  errorText: { color: '#D32F2F', fontSize: 16, textAlign: 'center', marginTop: 16 },
  retryButton: {
    backgroundColor: '#7C4DFF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 25,
    marginTop: 20,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Header
  headerOverlay: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  headerCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  difficultyBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  difficultyBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {
    borderWidth: 2,
    borderColor: '#7C4DFF',
  },
  dotEmoji: { fontSize: 14 },

  // Bottom card
  overlay: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderRadius: 24,
    width: '100%',
    shadowColor: '#7C4DFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },

  // Progress
  progressContainer: {
    height: 6,
    backgroundColor: '#E8E0F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#7C4DFF',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },

  // Timer
  timerRow: {
    backgroundColor: '#FFF3F3',
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  timerText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#333',
    fontFamily: 'System',
  },

  // Status
  statusText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
    fontWeight: '600',
    marginTop: 4,
  },
  statusCapturable: {
    color: '#2E7D32',
    fontWeight: '800',
    fontSize: 17,
  },

  // Distance
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  directionArrow: { fontSize: 22 },
  distanceText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#7C4DFF',
  },
  captureHint: {
    backgroundColor: '#4CAF50',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  captureHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Buttons
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 14,
  },
  relocateButton: {
    backgroundColor: '#F3E5F5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CE93D8',
  },
  relocateButtonText: {
    color: '#7B1FA2',
    fontSize: 14,
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#81C784',
  },
  resetButtonText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '700',
  },

  // Marker
  markerOuter: {
    padding: 10,
    borderRadius: 24,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerEmoji: { fontSize: 24 },

  // Celebration
  celebrationBanner: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(124, 77, 255, 0.95)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 20,
    shadowColor: '#7C4DFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
  },
  celebrationText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Modal Dificultad
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  difficultyCard: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: 30,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#333',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  difficultyButton: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 12,
    alignItems: 'center',
  },
  difficultyButtonText: {
    fontSize: 18,
    fontWeight: '800',
  },
  difficultyDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
});
