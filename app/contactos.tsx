import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Colors } from '../constants/Colors';
import { obtenerClavePublica, obtenerUsuario } from '../services/identidad';
import {
  normalizarE164, extraerPais, hashearTelefono,
  leerEntradaGun, publicarHash, borrarHash,
  guardarPais, leerEstado, buscarEnAgenda,
  type ContactoEncontrado,
} from '../services/contactos';

type Fase = 'inactivo' | 'inputNumero' | 'buscando' | 'listo';

export default function PantallaContactos() {
  const [fase, setFase] = useState<Fase>('inactivo');
  const [activo, setActivo] = useState(false);
  const [numero, setNumero] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [coincidencias, setCoincidencias] = useState<ContactoEncontrado[]>([]);

  useEffect(() => {
    leerEstado().then(async ({ activo: a, pais }) => {
      if (!a) return;
      setActivo(true);
      setFase('buscando');
      try {
        const encontrados = await buscarEnAgenda(pais ?? undefined);
        setCoincidencias(encontrados);
      } catch (e: any) {
        setError(
          e.message === 'permiso_denegado'
            ? 'Permiso de contactos denegado. Actívalo en los ajustes del sistema.'
            : 'Error al leer la agenda.',
        );
      } finally {
        setFase('listo');
      }
    });
  }, []);

  // Publica el hash en Gun y luego lee la agenda. Se llama tanto en el camino
  // directo (sin conflicto) como desde el callback del Alert de conflicto.
  const confirmarPublicar = async (
    hash: string,
    pubKey: string,
    alias: string,
    e164: string,
  ) => {
    setPublicando(true);
    try {
      await publicarHash(hash, pubKey, alias);
      const pais = extraerPais(e164);
      if (pais) await guardarPais(pais);
      setActivo(true);
      setNumero('');
      setFase('buscando');
      const encontrados = await buscarEnAgenda(pais);
      setCoincidencias(encontrados);
    } catch (e: any) {
      setError(
        e.message === 'permiso_denegado'
          ? 'Acceso a los contactos denegado. Actívalo en los ajustes del sistema.'
          : 'Error al leer la agenda.',
      );
    } finally {
      setPublicando(false);
      setFase('listo');
    }
  };

  const activar = async () => {
    const e164 = normalizarE164(numero.trim());
    if (!e164) {
      setError('Número no válido. Usa formato internacional: +34 612 345 678');
      return;
    }
    setError(null);
    setPublicando(true);
    try {
      const [miHash, miPubKey, miAlias] = await Promise.all([
        hashearTelefono(e164),
        obtenerClavePublica(),
        obtenerUsuario(),
      ]);
      if (!miPubKey || !miAlias) {
        setError('No se encontró tu identidad ELI. Reinicia la app.');
        return;
      }

      // Comprobación de conflicto: si el hash ya existe con otra pubKey, avisar.
      const existente = await leerEntradaGun(miHash);
      if (existente && existente.pubKey !== miPubKey) {
        setPublicando(false);
        Alert.alert(
          'Número ya registrado',
          'Este número ya está asociado a otra cuenta en ELI.\n\n¿Quieres sobrescribirlo con tu cuenta actual y continuar?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Sobrescribir',
              style: 'destructive',
              onPress: () => confirmarPublicar(miHash, miPubKey, miAlias, e164),
            },
          ],
        );
        return;
      }

      await confirmarPublicar(miHash, miPubKey, miAlias, e164);
    } catch {
      setError('Error al publicar. Comprueba tu conexión.');
    } finally {
      setPublicando(false);
    }
  };

  const desactivar = () => {
    Alert.alert(
      'Desactivar agenda',
      'Tu número se eliminará de ELI y dejarás de ser encontrable por tus contactos. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            await borrarHash();
            setActivo(false);
            setFase('inactivo');
            setCoincidencias([]);
            setError(null);
          },
        },
      ],
    );
  };

  const handleToggle = (val: boolean) => {
    if (val) {
      setFase('inputNumero');
      setError(null);
    } else {
      desactivar();
    }
  };

  const toggleValue = activo || fase === 'inputNumero';

  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.btnVolver}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.btnVolverTexto}>←</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Contactos</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Fila del interruptor */}
        <View style={styles.filaToggle}>
          <Text style={styles.labelToggle}>Conectar mi agenda</Text>
          <Switch
            value={toggleValue}
            onValueChange={handleToggle}
            trackColor={{ false: Colors.eli.grayDark, true: Colors.eli.primary }}
            thumbColor={Colors.eli.white}
            disabled={publicando || fase === 'buscando'}
            accessibilityLabel="Conectar mi agenda de contactos"
          />
        </View>

        {/* Aviso de privacidad — visible siempre que el interruptor esté activo */}
        {toggleValue && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>
              Tu número se convierte en un hash irreversible antes de salir de tu móvil.
              Nunca se guarda en texto plano en ningún servidor. Tu agenda tampoco se sube:
              los hashes se calculan en local y solo se consulta si existe una coincidencia en ELI.
            </Text>
          </View>
        )}

        {/* Fase: introducir número */}
        {fase === 'inputNumero' && (
          <View style={styles.seccionInput}>
            <Text style={styles.labelInput}>Tu número de teléfono</Text>
            <TextInput
              style={styles.input}
              placeholder="+34 612 345 678"
              placeholderTextColor={Colors.eli.grayLight}
              value={numero}
              onChangeText={(t) => { setNumero(t); setError(null); }}
              keyboardType="phone-pad"
              autoFocus
              accessibilityLabel="Tu número de teléfono en formato internacional"
            />
            {error && <Text style={styles.textoError}>{error}</Text>}
            <TouchableOpacity
              style={[styles.boton, (publicando || !numero.trim()) && styles.botonDesactivado]}
              onPress={activar}
              disabled={publicando || !numero.trim()}
              accessibilityRole="button"
            >
              {publicando
                ? <ActivityIndicator color={Colors.eli.background} />
                : <Text style={styles.botonTexto}>Activar y buscar contactos</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.botonCancelar}
              onPress={() => { setFase('inactivo'); setError(null); setNumero(''); }}
              accessibilityRole="button"
            >
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fase: buscando */}
        {fase === 'buscando' && (
          <View style={styles.centrado}>
            <ActivityIndicator color={Colors.eli.primary} size="large" />
            <Text style={styles.textoBuscando}>Buscando contactos en ELI…</Text>
          </View>
        )}

        {/* Fase: resultados */}
        {fase === 'listo' && (
          <View>
            {error && <Text style={[styles.textoError, { margin: 16 }]}>{error}</Text>}
            {coincidencias.length === 0 && !error && (
              <View style={styles.centrado}>
                <Text style={styles.textoVacio}>
                  Ningún contacto de tu agenda usa ELI todavía.{'\n'}¡Invítales!
                </Text>
              </View>
            )}
            {coincidencias.length > 0 && (
              <Text style={styles.subtitulo}>
                {coincidencias.length} contacto{coincidencias.length !== 1 ? 's' : ''} en ELI
              </Text>
            )}
            {coincidencias.map((c, i) => (
              <View key={`${c.alias}-${i}`} style={styles.filaContacto}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTexto}>{c.nombre[0].toUpperCase()}</Text>
                </View>
                <View style={styles.infoContacto}>
                  <Text style={styles.nombreContacto}>{c.nombre}</Text>
                  <Text style={styles.aliasContacto}>@{c.alias}</Text>
                </View>
                <TouchableOpacity
                  style={styles.botonChat}
                  onPress={() => router.push({ pathname: '/conversacion', params: { destinatario: c.alias } })}
                  accessibilityLabel={`Abrir chat con ${c.nombre}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.botonChatTexto}>Chatear</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  btnVolver: { padding: 8, marginRight: 8 },
  btnVolverTexto: { color: Colors.eli.primary, fontSize: 22 },
  titulo: { color: Colors.eli.white, fontSize: 18, fontWeight: '600' },
  scroll: { flex: 1 },
  filaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 16,
    padding: 16,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  labelToggle: { color: Colors.eli.white, fontSize: 16, fontWeight: '500' },
  aviso: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#1c3a37',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.eli.primary,
  },
  avisoTexto: { color: '#a0d4ce', fontSize: 13, lineHeight: 20 },
  seccionInput: { marginHorizontal: 16 },
  labelInput: { color: Colors.eli.grayLight, fontSize: 13, marginBottom: 8 },
  input: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    color: Colors.eli.white,
    fontSize: 16,
    marginBottom: 8,
  },
  textoError: { color: '#ff6b6b', fontSize: 13, marginBottom: 12 },
  boton: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  botonDesactivado: { opacity: 0.5 },
  botonTexto: { color: Colors.eli.background, fontWeight: '700', fontSize: 15 },
  botonCancelar: { alignItems: 'center', padding: 10 },
  botonCancelarTexto: { color: Colors.eli.grayLight, fontSize: 14 },
  centrado: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  textoBuscando: { color: Colors.eli.grayLight, marginTop: 16, fontSize: 14 },
  textoVacio: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  subtitulo: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  filaContacto: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 18 },
  infoContacto: { flex: 1 },
  nombreContacto: { color: Colors.eli.white, fontSize: 15, fontWeight: '600' },
  aliasContacto: { color: Colors.eli.grayLight, fontSize: 12, marginTop: 2 },
  botonChat: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  botonChatTexto: { color: Colors.eli.background, fontSize: 13, fontWeight: '700' },
});
