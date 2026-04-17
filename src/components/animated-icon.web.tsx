import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function AnimatedSplashOverlay() {
  return null;
}

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
    width: 128,
    height: 128,
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E6F4FE',
    borderRadius: 30,
  },
  imageContainer: {
    width: 76,
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 76,
    height: 76,
  },
});
