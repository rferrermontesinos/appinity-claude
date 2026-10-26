import { useEffect, useState } from 'react';
import { Animated, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import GRAIN from '../../assets/grain.png';
import { motion } from '../theme';

/** Mezcla dos colores hex (#RRGGBB): t = 0 devuelve `a`; t = 1, `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Brillo radial sin degradados nativos: círculos concéntricos casi transparentes que se acumulan hacia el centro
 * (como el velo de bandas de la tarjeta). El grano encima disimula los escalones.
 */
function Glow({ color, size, x, y, strength }: { color: string; size: number; x: number; y: number; strength: number }) {
  const steps = 18;
  return (
    <>
      {Array.from({ length: steps }, (_, i) => {
        const d = size * (1 - i / steps);
        return (
          <View
            key={i}
            style={{ position: 'absolute', left: x - d / 2, top: y - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: color, opacity: strength }}
          />
        );
      })}
    </>
  );
}

function AuraLayer({ color, width }: { color: string; width: number }) {
  const light = mixHex(color, '#FFFFFF', 0.15);
  return (
    <>
      <Glow color={light} size={width * 1.1} x={width * 0.3} y={width * 0.45} strength={0.035} />
      <Glow color={color} size={width * 1.2} x={width * 0.85} y={width * 1.05} strength={0.03} />
      <Glow color={color} size={width * 1.4} x={width * 0.5} y={width * 1.7} strength={0.02} />
    </>
  );
}

/**
 * Halo de «Aura»: luz ambiental del color de lo que se muestra, detrás del contenido y sin texto encima (el texto va
 * siempre sobre una superficie). Al cambiar de color se funde en medio segundo, salvo con «reducir movimiento».
 */
export function AuraBackdrop({ color, width, style }: { color: string; width: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(color);
  const [prev, setPrev] = useState<string | null>(null);
  const [fade] = useState(() => new Animated.Value(1));
  // Cambio de color durante el render (patrón recomendado por React): el anterior queda debajo mientras se funde.
  if (color !== shown) {
    setPrev(shown);
    setShown(color);
  }
  useEffect(() => {
    if (!prev || reduce) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: motion.auraFadeMs, useNativeDriver: true }).start(() => setPrev(null));
  }, [prev, reduce, fade]);

  return (
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ overflow: 'hidden' }, style]}>
      {prev && !reduce ? (
        <View style={StyleSheet.absoluteFill}>
          <AuraLayer color={prev} width={width} />
        </View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduce ? 1 : fade }]}>
        <AuraLayer color={shown} width={width} />
      </Animated.View>
      <Grain opacity={0.5} />
    </View>
  );
}

/** Grano fino en mosaico (assets/grain.png, blanco con alfa aleatorio): textura y menos bandas en los brillos. */
export function Grain({ opacity = 0.35 }: { opacity?: number }) {
  return (
    <Image
      source={GRAIN}
      resizeMode="repeat"
      accessible={false}
      importantForAccessibility="no"
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity }]}
    />
  );
}
