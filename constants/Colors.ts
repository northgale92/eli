import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#E8E8E8',
    background: '#1a1a1a',
    tint: '#00B5A0',
    icon: '#9A9AB0',
    tabIconDefault: '#9A9AB0',
    tabIconSelected: '#00B5A0',
  },
  dark: {
    text: '#E8E8E8',
    background: '#1a1a1a',
    tint: '#00B5A0',
    icon: '#9A9AB0',
    tabIconDefault: '#9A9AB0',
    tabIconSelected: '#00B5A0',
  },
  eli: {
    // Fondos
    background: '#1a1a1a',      // Fondo principal
    grayDark: '#2c2c2c',        // Tarjetas/superficies
    border: 'rgba(0,201,177,0.2)', // Bordes turquesa translúcido

    // Colores principales - turquesa mas elegante
    primary: '#00B5A0',         // Turquesa un tono mas apagado
    primaryDark: '#009482',
    primaryFaded: '#00C4AD18', // Turquesa muy transparente

    // Textos
    white: '#EAEEF4',           // Blanco con toque azulado
    grayLight: '#9A9AB0',       // Gris medio neutro

    // Estados
    error: '#E05555',
    warning: '#E09A00',
    success: '#00C4AD',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
