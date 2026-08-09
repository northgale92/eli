import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, BackHandler,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Colors } from '../constants/Colors';
import {
  iniciarLlamada, responderLlamada, colgar, silenciar,
} from '../services/llamadas';

type EstadoLlamada = 'iniciando' | 'llamando' | 'entrante' | 'activa' | 'error';

export default function Llamada() {
  const { tipo, destinatario, de, sesionId, miPubKey } = useLocalSearchParams<{
    tipo: 'saliente' | 'entrante';
    destinatario?: string;
    de?: string;
    sesionId?: string;
    miPubKey: string;
  }>();

  const [estado, setEstado] = useState<EstadoLlamada>(
    tipo === 'entrante' ? 'entrante' : 'iniciando',
  );
  const [silenciado, setSilenciado] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const yaTerminandoRef = useRef(false);

  const contraparte = tipo === 'saliente' ? (destinatario ?? '') : (de ?? '');

  const terminar = useCallback(async () => {
    if (yaTerminandoRef.current) return;
    yaTerminandoRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    await colgar();
    router.back();
  }, []);

  // Inicia la llamada saliente al montar la pantalla
  useEffect(() => {
    if (tipo !== 'saliente' || !destinatario || !miPubKey) return;
    iniciarLlamada(
      miPubKey,
      destinatario,
      () => setEstado('activa'),
      () => terminar(),
    )
      .then(() => setEstado('llamando'))
      .catch((e: any) => {
        Alert.alert('Error', e?.message ?? 'No se pudo iniciar la llamada');
        setEstado('error');
        setTimeout(() => router.back(), 1500);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Temporizador de duración (solo cuando la llamada está activa)
  useEffect(() => {
    if (estado === 'activa') {
      timerRef.current = setInterval(() => setDuracion((d) => d + 1), 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [estado]);

  // Botón atrás de Android: colgar si estamos en llamada
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (estado === 'activa' || estado === 'llamando') {
        terminar();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [estado, terminar]);

  const aceptar = async () => {
    if (!miPubKey || !de || !sesionId) return;
    try {
      setEstado('iniciando');
      await responderLlamada(miPubKey, de, sesionId, () => terminar());
      setEstado('activa');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo conectar');
      setEstado('error');
      setTimeout(() => router.back(), 1500);
    }
  };

  const toggleSilencio = () => {
    const nuevo = !silenciado;
    setSilenciado(nuevo);
    silenciar(nuevo);
  };

  const formatDuracion = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const textoEstado = () => {
    switch (estado) {
      case 'iniciando': return 'Preparando llamada...';
      case 'llamando': return 'Llamando...';
      case 'entrante': return 'Llamada entrante';
      case 'activa': return formatDuracion(duracion);
      case 'error': return 'Error al conectar';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatarGrande}>
        <Text style={styles.avatarLetra}>
          {contraparte ? contraparte[0].toUpperCase() : '?'}
        </Text>
      </View>

      <Text style={styles.nombre}>{contraparte || '—'}</Text>
      <Text style={styles.subtitulo}>{textoEstado()}</Text>

      {estado === 'activa' && (
        <Text style={styles.etiquetaCifrado}>🔒 Cifrada E2E · WebRTC</Text>
      )}

      <View style={styles.botones}>
        {estado === 'entrante' && (
          <>
            <View style={styles.botonWrap}>
              <TouchableOpacity
                style={styles.botonColgar}
                onPress={terminar}
                accessibilityLabel="Rechazar llamada"
                accessibilityRole="button"
              >
                <Text style={styles.botonIcono}>📵</Text>
              </TouchableOpacity>
              <Text style={styles.botonEtiqueta}>Rechazar</Text>
            </View>
            <View style={styles.botonWrap}>
              <TouchableOpacity
                style={styles.botonAceptar}
                onPress={aceptar}
                accessibilityLabel="Aceptar llamada"
                accessibilityRole="button"
              >
                <Text style={styles.botonIcono}>📞</Text>
              </TouchableOpacity>
              <Text style={styles.botonEtiqueta}>Aceptar</Text>
            </View>
          </>
        )}

        {estado === 'activa' && (
          <>
            <View style={styles.botonWrap}>
              <TouchableOpacity
                style={[styles.botonSecundario, silenciado && styles.botonSecundarioActivo]}
                onPress={toggleSilencio}
                accessibilityLabel={silenciado ? 'Activar micrófono' : 'Silenciar micrófono'}
                accessibilityRole="button"
              >
                <Text style={styles.botonIcono}>{silenciado ? '🔇' : '🎤'}</Text>
              </TouchableOpacity>
              <Text style={styles.botonEtiqueta}>{silenciado ? 'Activar mic' : 'Silenciar'}</Text>
            </View>
            <View style={styles.botonWrap}>
              <TouchableOpacity
                style={styles.botonColgar}
                onPress={terminar}
                accessibilityLabel="Colgar"
                accessibilityRole="button"
              >
                <Text style={styles.botonIcono}>📵</Text>
              </TouchableOpacity>
              <Text style={styles.botonEtiqueta}>Colgar</Text>
            </View>
          </>
        )}

        {estado === 'llamando' && (
          <View style={styles.botonWrap}>
            <TouchableOpacity
              style={styles.botonColgar}
              onPress={terminar}
              accessibilityLabel="Cancelar llamada"
              accessibilityRole="button"
            >
              <Text style={styles.botonIcono}>📵</Text>
            </TouchableOpacity>
            <Text style={styles.botonEtiqueta}>Cancelar</Text>
          </View>
        )}

        {(estado === 'iniciando' || estado === 'error') && (
          <Text style={styles.espera}>
            {estado === 'error' ? 'Cerrando...' : 'Un momento...'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.eli.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  avatarGrande: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  avatarLetra: {
    color: Colors.eli.background,
    fontSize: 48,
    fontWeight: 'bold',
  },
  nombre: {
    color: Colors.eli.white,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitulo: {
    color: Colors.eli.primary,
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  etiquetaCifrado: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    marginBottom: 8,
  },
  botones: {
    flexDirection: 'row',
    gap: 40,
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonWrap: {
    alignItems: 'center',
    gap: 8,
  },
  botonAceptar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonColgar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.eli.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSecundario: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSecundarioActivo: {
    borderColor: Colors.eli.primary,
    backgroundColor: '#0D2B2B',
  },
  botonIcono: {
    fontSize: 28,
  },
  botonEtiqueta: {
    color: Colors.eli.grayLight,
    fontSize: 12,
  },
  espera: {
    color: Colors.eli.grayLight,
    fontSize: 14,
  },
});
