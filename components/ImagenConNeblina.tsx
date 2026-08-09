import { useState } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface Props {
  uri: string;
  requiereNeblina: boolean;
  esPeriodista?: boolean;
  style?: object;
}

export function ImagenConNeblina({ uri, requiereNeblina, esPeriodista, style }: Props) {
  const [neblinaQuitada, setNeblinaQuitada] = useState(false);

  return (
    <View style={[styles.contenedor, style]}>
      <Image
        source={{ uri }}
        style={styles.imagen}
        resizeMode="cover"
        // Cuando hay neblina y no ha sido quitada, la imagen sigue montada
        // pero cubierta por el overlay. Esto evita un flash al revelar.
        accessible={neblinaQuitada || !requiereNeblina}
        accessibilityLabel={
          !requiereNeblina || neblinaQuitada
            ? 'Imagen adjunta'
            : 'Imagen oculta por contenido sensible'
        }
      />

      {requiereNeblina && !neblinaQuitada && (
        <View style={styles.overlay}>
          {esPeriodista && (
            <View style={styles.badgePeriodista}>
              <Text style={styles.badgeIcono}>◎</Text>
              <Text style={styles.badgeTexto}>Periodista verificado</Text>
            </View>
          )}

          <Text style={styles.avisoTitulo}>
            {esPeriodista
              ? 'Esta imagen puede dañar tu sensibilidad'
              : 'Contenido sensible'}
          </Text>
          <Text style={styles.avisoSub}>
            {esPeriodista
              ? 'Publicada por un periodista verificado en ELI'
              : 'Esta imagen ha sido marcada como contenido sensible'}
          </Text>

          <TouchableOpacity
            style={styles.botonVer}
            onPress={() => setNeblinaQuitada(true)}
            accessibilityLabel="Ver imagen"
            accessibilityRole="button"
          >
            <Text style={styles.botonVerTexto}>Ver imagen</Text>
          </TouchableOpacity>
        </View>
      )}

      {requiereNeblina && neblinaQuitada && esPeriodista && (
        <View style={styles.bannerPeriodistaMini}>
          <Text style={styles.bannerPeriodistaMiniTexto}>
            ◎ Periodista verificado — esta imagen puede dañar tu sensibilidad
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.eli.grayDark,
  },
  imagen: {
    width: '100%',
    height: 220,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 15, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  badgePeriodista: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 181, 160, 0.15)',
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  badgeIcono: {
    color: Colors.eli.primary,
    fontSize: 14,
  },
  badgeTexto: {
    color: Colors.eli.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  avisoTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  avisoSub: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  botonVer: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  botonVerTexto: {
    color: Colors.eli.white,
    fontSize: 13,
    fontWeight: '600',
  },
  bannerPeriodistaMini: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bannerPeriodistaMiniTexto: {
    color: Colors.eli.primary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
