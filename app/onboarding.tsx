import { View, Text, StyleSheet, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { useState } from 'react';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

const pasos = [
  {
    icono: '◎',
    titulo: 'Bienvenido a ELI',
    subtitulo: 'Tu privacidad nos importa',
    descripcion: 'Una red social donde nadie te espía, nadie te vende y nadie te rastrea. Solo tú.',
  },
  {
    icono: '◈',
    titulo: 'Sin email. Sin teléfono.',
    subtitulo: 'Tu identidad es tuya',
    descripcion: 'ELI no sabe quién eres. Nadie lo sabe. Tu identidad vive solo en tu dispositivo.',
  },
  {
    icono: '◉',
    titulo: 'Red descentralizada',
    subtitulo: 'Nadie puede apagarla',
    descripcion: 'ELI no tiene servidor central. Vive en los dispositivos de sus usuarios. Es indestructible.',
  },
  {
    icono: '◇',
    titulo: 'Con conciencia',
    subtitulo: 'Parte del dinero hace el bien',
    descripcion: 'Las empresas que anuncian en ELI contribuyen a proyectos solidarios votados por ti.',
  },
  {
    icono: '◎',
    titulo: 'ELI es tuya',
    subtitulo: 'Y de todos',
    descripcion: 'ELI pertenece a su comunidad. Ninguna empresa la posee. Ningún inversor la controla.',
  },
];

export default function Onboarding() {
  const [pasoActual, setPasoActual] = useState(0);
  const [usuario, setUsuario] = useState('');
  const [errorUsuario, setErrorUsuario] = useState('');

  const validarUsuario = (texto: string) => {
    const limpio = texto.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsuario(limpio);
    if (limpio.length > 0 && limpio.length < 3) {
      setErrorUsuario('Mínimo 3 caracteres');
    } else {
      setErrorUsuario('');
    }
  };

  const siguiente = () => {
    if (pasoActual < pasos.length - 1) {
      setPasoActual(pasoActual + 1);
    } else {
      // Último paso informativo — ir a elegir usuario
      setPasoActual(pasos.length);
    }
  };

  const saltar = () => {
    setPasoActual(pasos.length);
  };

  const continuar = () => {
    if (usuario.length < 3) {
      setErrorUsuario('Mínimo 3 caracteres');
      return;
    }
    router.push({ pathname: '/identidad', params: { usuario } });
  };

  // Paso de elegir @usuario
  if (pasoActual === pasos.length) {
    return (
      <View style={styles.container}>
        <View style={styles.contenido}>
          <Text style={styles.icono}>◎</Text>
          <Text style={styles.titulo}>Elige tu nombre</Text>
          <Text style={styles.subtitulo}>Tu identidad en ELI</Text>
          <Text style={styles.descripcion}>
            Este es el nombre con el que te conocerán en ELI. Puedes usar letras, números y guión bajo.
          </Text>
          <View style={styles.inputContainer}>
            <Text style={styles.arroba}>@</Text>
            <TextInput
              style={styles.input}
              placeholder="tu_nombre"
              placeholderTextColor={Colors.eli.grayLight}
              value={usuario}
              onChangeText={validarUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
          </View>
          {errorUsuario ? (
            <Text style={styles.error}>{errorUsuario}</Text>
          ) : usuario.length >= 3 ? (
            <Text style={styles.usuarioOk}>@{usuario} disponible</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.boton, usuario.length < 3 && { opacity: 0.4 }]}
          onPress={continuar}
          disabled={usuario.length < 3}
        >
          <Text style={styles.botonTexto}>Crear mi identidad</Text>
        </TouchableOpacity>
        <Text style={styles.nota}>ELI no almacena ningún dato tuyo. Nunca.</Text>
      </View>
    );
  }

  const paso = pasos[pasoActual];
  const esUltimo = pasoActual === pasos.length - 1;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.saltar} onPress={saltar}>
        <Text style={styles.saltarTexto}>{esUltimo ? '' : 'Saltar'}</Text>
      </TouchableOpacity>

      <View style={styles.contenido}>
        <Text style={styles.icono}>{paso.icono}</Text>
        <Text style={styles.titulo}>{paso.titulo}</Text>
        <Text style={styles.subtitulo}>{paso.subtitulo}</Text>
        <Text style={styles.descripcion}>{paso.descripcion}</Text>
      </View>

      <View style={styles.indicadores}>
        {pasos.map((_, index) => (
          <View
            key={index}
            style={[styles.indicador, index === pasoActual && styles.indicadorActivo]}
          />
        ))}
      </View>

      <TouchableOpacity style={styles.boton} onPress={siguiente}>
        <Text style={styles.botonTexto}>{esUltimo ? 'Siguiente' : 'Siguiente'}</Text>
      </TouchableOpacity>

      <Text style={styles.nota}>ELI no almacena ningún dato tuyo. Nunca.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.eli.background,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  saltar: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  saltarTexto: {
    color: Colors.eli.grayLight,
    fontSize: 15,
  },
  contenido: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icono: {
    fontSize: 80,
    color: Colors.eli.primary,
    marginBottom: 32,
    textAlign: 'center',
  },
  titulo: {
    color: Colors.eli.white,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitulo: {
    color: Colors.eli.primary,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  descripcion: {
    color: Colors.eli.grayLight,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    paddingHorizontal: 16,
    alignSelf: 'stretch',
  },
  arroba: {
    color: Colors.eli.primary,
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: Colors.eli.white,
    fontSize: 18,
    paddingVertical: 14,
  },
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 8,
  },
  usuarioOk: {
    color: Colors.eli.primary,
    fontSize: 13,
    marginTop: 8,
  },
  indicadores: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  indicador: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.eli.border,
  },
  indicadorActivo: {
    width: 24,
    backgroundColor: Colors.eli.primary,
  },
  boton: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  botonTexto: {
    color: Colors.eli.background,
    fontSize: 17,
    fontWeight: 'bold',
  },
  nota: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
