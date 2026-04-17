import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/**
 * Overlay de splash screen estático para evitar errores de librerías de animación.
 */
export function AnimatedSplashOverlay() {
  // Simplemente no renderizamos el overlay animado para evitar el error de worklets
  return null;
}

/**
 * Versión estática del icono para evitar dependencias de react-native-reanimated.
 */
export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <View style={styles.background} />
      <View style={styles.imageContainer}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E6F4FE',
    borderRadius: 40,
  },
  imageContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
});
