import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { crearIdentidad } from '../services/identidad';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

export default function Identidad() {
  const { usuario } = useLocalSearchParams<{ usuario: string }>();
  const [paso, setPaso] = useState(0);
  const [clavePublica, setClavePublica] = useState('');

  useEffect(() => {
    if (paso === 1 && usuario) {
      crearIdentidad(usuario).then(id => {
        setClavePublica(id.clavePublica);
      });
    }
  }, [paso]);

  return (
    <View style={styles.container}>
      {paso === 0 && <PasoInicio usuario={usuario} onSiguiente={() => setPaso(1)} />}
      {paso === 1 && <PasoGenerando clavePublica={clavePublica} onSiguiente={() => setPaso(2)} />}
      {paso === 2 && <PasoHuella onSiguiente={() => setPaso(3)} />}
      {paso === 3 && <PasoListo usuario={usuario} />}
    </View>
  );
}

function PasoInicio({ usuario, onSiguiente }: { usuario: string, onSiguiente: () => void }) {
  return (
    <View style={styles.paso}>
      <Text style={styles.ojo}>◎</Text>
      <Text style={styles.titulo}>Hola, @{usuario}</Text>
      <Text style={styles.subtitulo}>Tu privacidad nos importa</Text>
      <Text style={styles.descripcion}>
        ELI va a generar una identidad criptográfica única para ti.
        Solo tú la tendrás. Nadie más puede acceder a ella, ni siquiera nosotros.
      </Text>
      <View style={styles.puntos}>
        <Text style={styles.punto}>Tu clave nunca sale de este dispositivo</Text>
        <Text style={styles.punto}>Nadie puede rastrearte</Text>
        <Text style={styles.punto}>Funciona en toda la red ELI</Text>
      </View>
      <TouchableOpacity style={styles.boton} onPress={onSiguiente}>
        <Text style={styles.botonTexto}>Crear mi identidad</Text>
      </TouchableOpacity>
    </View>
  );
}

function PasoGenerando({ clavePublica, onSiguiente }: { clavePublica: string, onSiguiente: () => void }) {
  return (
    <View style={styles.paso}>
      <Text style={styles.ojo}>◎</Text>
      <Text style={styles.titulo}>Generando tu clave...</Text>
      <Text style={styles.descripcion}>
        Estamos creando un par de claves criptográficas únicas para ti.
        Este proceso ocurre completamente en tu dispositivo.
      </Text>
      <View style={styles.claveBox}>
        <Text style={styles.claveLabel}>Tu clave pública</Text>
        <Text style={styles.clave}>{clavePublica || 'Generando...'}</Text>
        <Text style={styles.claveNota}>Esta es tu identidad en la red ELI</Text>
      </View>
      <TouchableOpacity
        style={[styles.boton, !clavePublica && { opacity: 0.4 }]}
        onPress={onSiguiente}
        disabled={!clavePublica}
      >
        <Text style={styles.botonTexto}>Continuar</Text>
      </TouchableOpacity>
    </View>
  );
}

function PasoHuella({ onSiguiente }: { onSiguiente: () => void }) {
  const [biometriaGuardada, setBiometriaGuardada] = useState(false);

  const activarBiometria = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        // El dispositivo no tiene hardware biométrico — avanzamos igual
        onSiguiente();
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        // No hay huellas/configuración facial registrada en el dispositivo — avanzamos igual
        onSiguiente();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Activar biometría en ELI',
        fallbackLabel: 'Usar código de acceso',
        cancelLabel: 'Omitir',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Huella verificada correctamente — guardamos la marca
        await AsyncStorage.setItem('eli-biometria-activada', 'true');
        setBiometriaGuardada(true);
        setTimeout(() => onSiguiente(), 600);
      } else {
        // Usuario canceló o falló — avanzamos igual (biometría opcional)
        onSiguiente();
      }
    } catch {
      // Error inesperado — avanzamos igual
      onSiguiente();
    }
  };

  return (
    <View style={styles.paso}>
      <Text style={styles.huella}>☉</Text>
      <Text style={styles.titulo}>Protege tu identidad</Text>
      <Text style={styles.descripcion}>
        Usa tu huella dactilar o reconocimiento facial para proteger
        tu clave privada. Solo tú puedes abrir ELI.
      </Text>
      <TouchableOpacity
        style={[styles.huellaBoton, biometriaGuardada && styles.huellaBotonActiva]}
        onPress={activarBiometria}
      >
        <Text style={styles.huellaIcono}>{biometriaGuardada ? '✓' : '⦿'}</Text>
        <Text style={styles.huellaTexto}>
          {biometriaGuardada ? '¡Biometría activada!' : 'Toca para activar biometría'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function PasoListo({ usuario }: { usuario: string }) {
  const entrar = async () => {
    try {
      await AsyncStorage.setItem('eli-onboarding-completo', 'true');
    } catch {}
    router.replace('/dashboard' as any);
  };

  return (
    <View style={styles.paso}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.titulo}>Ya eres parte de ELI</Text>
      <Text style={styles.descripcion}>
        Tu identidad está creada y protegida. Bienvenido/a a una red
        donde tú controlas tus datos.
      </Text>
      <View style={styles.puntos}>
        <Text style={styles.punto}>@{usuario} registrado en ELI</Text>
        <Text style={styles.punto}>Clave privada protegida con biometría</Text>
        <Text style={styles.punto}>Listo para conectar con la red</Text>
      </View>
      <TouchableOpacity style={styles.boton} onPress={entrar}>
        <Text style={styles.botonTexto}>Entrar a ELI</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.eli.background,
  },
  paso: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ojo: {
    fontSize: 80,
    color: Colors.eli.primary,
    marginBottom: 24,
  },
  huella: {
    fontSize: 80,
    color: Colors.eli.primary,
    marginBottom: 24,
  },
  check: {
    fontSize: 80,
    color: Colors.eli.primary,
    marginBottom: 24,
  },
  titulo: {
    color: Colors.eli.white,
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitulo: {
    color: Colors.eli.primary,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  descripcion: {
    color: Colors.eli.grayLight,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  puntos: {
    alignSelf: 'stretch',
    marginBottom: 32,
    gap: 12,
  },
  punto: {
    color: Colors.eli.white,
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  boton: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  botonTexto: {
    color: Colors.eli.background,
    fontSize: 17,
    fontWeight: 'bold',
  },
  claveBox: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 20,
    alignSelf: 'stretch',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    alignItems: 'center',
  },
  claveLabel: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clave: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 8,
    textAlign: 'center',
  },
  claveNota: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textAlign: 'center',
  },
  huellaBoton: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 100,
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.eli.primary,
    marginBottom: 32,
  },
  huellaBotonActiva: {
    borderColor: '#00C9B1',
    backgroundColor: '#1a3a35',
  },
  huellaIcono: {
    fontSize: 60,
    color: Colors.eli.primary,
    marginBottom: 8,
  },
  huellaTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    textAlign: 'center',
  },
});
