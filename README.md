# App Busca el Tesoro - React Native Expo

Este proyecto es un mini-juego de búsqueda de tesoros utilizando geolocalización en tiempo real.

## Requisitos Previos
- Node.js instalado.
- Expo Go en tu dispositivo móvil (iOS o Android) para probar la geolocalización real.

## Instalación

1. Instala las dependencias necesarias:
   ```bash
   npm install expo-sqlite expo-location react-native-maps
   ```

2. Inicia el proyecto:
   ```bash
   npx expo start
   ```

## Estructura del Proyecto
- `src/database/database.js`: Configuración de SQLite y funciones CRUD.
- `src/utils/geoUtils.js`: Funciones para cálculo de distancia (Haversine) y generación de coordenadas.
- `src/components/TreasureHunt.js`: Componente principal con la lógica del juego y el mapa.
- `src/app/index.tsx`: Punto de entrada de la aplicación.

## Características
- **Geolocalización Real**: Rastreo de la posición del usuario en tiempo real.
- **Persistencia**: Los tesoros se guardan localmente en una base de datos SQLite.
- **Lógica de Proximidad**: El juego detecta automáticamente cuando estás a menos de 30 metros del tesoro activo.
- **Visualización**: Solo se muestra en el mapa el tesoro más cercano que aún no ha sido encontrado.

## Notas de Desarrollo
- La aplicación solicita permisos de ubicación al inicio.
- Se generan 3 tesoros aleatorios dentro de un radio de 200m de la ubicación inicial si la base de datos está vacía.
- La distancia se calcula usando la fórmula de Haversine para mayor precisión.
