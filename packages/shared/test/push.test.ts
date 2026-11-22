import { describe, expect, it } from 'vitest';
import { EXPO_PUSH_TOKEN, PUSH_CHANNEL_ID, PUSH_SCREENS, pushScreen, pushTokenRemoveSchema, pushTokenSchema } from '../src/push.js';

describe('contrato de las notificaciones push (fase B6)', () => {
  it('la pantalla de una notificación tocada: solo las conocidas', () => {
    expect(PUSH_SCREENS).toContain('home');
    expect(pushScreen({ screen: 'home' })).toBe('home');
    // Cualquier otra cosa se ignora: la app nunca navega a una ruta que venga en la notificación.
    for (const data of [{ screen: '/settings' }, { screen: 'person/3f2b8c1e' }, { screen: 1 }, { route: 'home' }, ['home'], 'home', null, undefined]) {
      expect(pushScreen(data)).toBeNull();
    }
  });

  it('el canal de Android es el que el servidor pone en cada mensaje', () => {
    expect(PUSH_CHANNEL_ID).toBe('default');
  });

  it('solo acepta tokens de Expo y dispositivos Android o iOS, sin campos de más', () => {
    expect(EXPO_PUSH_TOKEN.test('ExponentPushToken[abcdefghij0123]')).toBe(true);
    expect(EXPO_PUSH_TOKEN.test('ExpoPushToken[abcdefghij0123]')).toBe(true);
    expect(EXPO_PUSH_TOKEN.test('fcm:abcdefghij0123')).toBe(false);
    const token = 'ExponentPushToken[abcdefghij0123]';
    expect(pushTokenSchema.safeParse({ token, platform: 'android' }).success).toBe(true);
    expect(pushTokenSchema.safeParse({ token, platform: 'web' }).success).toBe(false);
    expect(pushTokenSchema.safeParse({ token, platform: 'ios', userId: 'otra-persona' }).success).toBe(false);
    expect(pushTokenRemoveSchema.safeParse({ token }).success).toBe(true);
    expect(pushTokenRemoveSchema.safeParse({ token: 'corto' }).success).toBe(false);
  });
});
