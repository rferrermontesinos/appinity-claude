import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Versión y plataforma de la app, tal como las acepta la API (avisos de errores y comentarios de la beta). La versión
 * sale de app.json; si no tiene la forma x.y.z se envía 0.0.0. Otras plataformas de React Native no se envían.
 */
const VERSION_SHAPE = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/;
const rawVersion = Constants.expoConfig?.version ?? '';

export const APP_VERSION = VERSION_SHAPE.test(rawVersion) ? rawVersion : '0.0.0';

export type AppPlatform = 'android' | 'ios' | 'web';

export const APP_PLATFORM: AppPlatform | null = Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : null;
