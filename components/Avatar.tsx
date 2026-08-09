import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface Props {
  nombre: string;      // usado para la inicial de respaldo
  fotoBase64?: string | null;
  fotoMime?: string;
  size?: number;
  style?: object;
}

// Avatar con foto de perfil y respaldo a inicial — mismo patrón repetido
// antes en chat.tsx/conversacion.tsx/perfil.tsx/reenviar.tsx, ahora centralizado
// para que mostrar la foto de perfil real (services/identidad.ts) no requiera
// tocar cada pantalla por separado.
export function Avatar({ nombre, fotoBase64, fotoMime, size = 44, style }: Props) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      style={[styles.contenedor, dimension, style]}
      accessibilityLabel={`Avatar de ${nombre}`}
    >
      {fotoBase64 ? (
        <Image
          source={{ uri: `data:${fotoMime ?? 'image/jpeg'};base64,${fotoBase64}` }}
          style={dimension}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.inicial, { fontSize: size * 0.42 }]}>
          {nombre ? nombre[0].toUpperCase() : '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: Colors.eli.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inicial: { color: Colors.eli.background, fontWeight: 'bold' },
});
