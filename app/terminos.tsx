import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

export default function Terminos() {
  useEffect(() => {
    const comprobar = async () => {
      const onboardingDone = await AsyncStorage.getItem('eli-onboarding-completo').catch(() => null);
      if (onboardingDone === 'true') {
        router.replace('/dashboard');
      }
    };
    comprobar();
  }, []);

  const aceptar = () => {
    router.replace('/onboarding');
  };

  const noAceptar = () => {
    Alert.alert(
      'Términos no aceptados',
      'Para usar ELI debes aceptar los términos de uso.',
      [{ text: 'Cerrar', onPress: () => Alert.alert('Gracias', 'Puedes volver cuando quieras.') }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Términos de uso</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.version}>Versión 1.0 — Marzo 2025</Text>
        <Text style={styles.intro}>
          ELI es una red social diferente. Antes de empezar, queremos que entiendas cómo funciona y qué aceptas al usarla. No hay letra pequeña.
        </Text>

        {/* ESPAÑOL */}
        <Text style={styles.seccionTitulo}>1. PRIVACIDAD TOTAL</Text>
        <Text style={styles.seccionTexto}>
          ELI no guarda ningún dato tuyo en servidores. Tu identidad es una clave criptográfica que solo existe en tu dispositivo. Si pierdes el dispositivo, nadie puede acceder a tu cuenta.
        </Text>

        <Text style={styles.seccionTitulo}>2. LA IA TRABAJA EN TU DISPOSITIVO</Text>
        <Text style={styles.seccionTexto}>
          Todo el contenido que publicas o envías es analizado por la IA antes de salir de tu dispositivo. El contenido dañino nunca llega a la red. Al usar ELI aceptas este análisis local.
        </Text>

        <Text style={styles.seccionTitulo}>3. LA PESTAÑA SOLIDARIA</Text>
        <Text style={styles.seccionTexto}>
          El reservorio solidario se nutre de las cuotas de las tiendas del Mercado y de donaciones voluntarias. Los proyectos son validados por la IA antes de entrar a votación. El dinero se transfiere automáticamente a los proyectos elegidos por la comunidad — nunca a cuentas personales. Las organizaciones tienen 30 días para publicar facturas. Si no cumplen, son expulsadas permanentemente.
        </Text>

        <Text style={styles.seccionTitulo}>4. DONACIONES</Text>
        <Text style={styles.seccionTexto}>
          Las donaciones son completamente voluntarias. Se usan exclusivamente para pagar el servidor y la API de moderación. Los costes reales se publican cada mes en Ajustes &gt; Contribuir.
        </Text>

        <Text style={styles.seccionTitulo}>5. SIN ANUNCIOS</Text>
        <Text style={styles.seccionTexto}>
          ELI no tiene anuncios y nunca los tendrá. Nadie paga para aparecer en tu feed.
        </Text>

        <Text style={styles.seccionTitulo}>6. CÓDIGO ABIERTO</Text>
        <Text style={styles.seccionTexto}>
          ELI pertenece a la comunidad. El código fuente es público y cualquiera puede revisarlo, mejorarlo o crear su propia versión.
        </Text>

        <Text style={styles.seccionTitulo}>7. EDAD MÍNIMA</Text>
        <Text style={styles.seccionTexto}>
          ELI no está destinada a menores de 16 años.
        </Text>

        {/* SEPARADOR ENGLISH */}
        <View style={styles.separadorIdioma}>
          <View style={styles.linea} />
          <Text style={styles.idiomaLabel}>ENGLISH</Text>
          <View style={styles.linea} />
        </View>

        <Text style={styles.seccionTitulo}>1. TOTAL PRIVACY</Text>
        <Text style={styles.seccionTexto}>
          ELI does not store any of your data on servers. Your identity is a cryptographic key that exists only on your device. If you lose your device, nobody can access your account.
        </Text>

        <Text style={styles.seccionTitulo}>2. AI RUNS ON YOUR DEVICE</Text>
        <Text style={styles.seccionTexto}>
          All content you publish or send is analyzed by AI before leaving your device. Harmful content never reaches the network. By using ELI you accept this local analysis.
        </Text>

        <Text style={styles.seccionTitulo}>3. THE SOLIDARITY TAB</Text>
        <Text style={styles.seccionTexto}>
          The solidarity reservoir is funded by Marketplace store fees and voluntary donations. Projects are validated by AI before entering a vote. Money is automatically transferred to the projects chosen by the community — never to personal accounts. Organizations have 30 days to publish receipts. If they fail, they are permanently expelled.
        </Text>

        <Text style={styles.seccionTitulo}>4. DONATIONS</Text>
        <Text style={styles.seccionTexto}>
          Donations are completely voluntary. They are used exclusively to pay for the server and the moderation API. Real costs are published each month in Settings &gt; Contribute.
        </Text>

        <Text style={styles.seccionTitulo}>5. NO ADS</Text>
        <Text style={styles.seccionTexto}>
          ELI has no ads and never will. Nobody pays to appear on your feed.
        </Text>

        <Text style={styles.seccionTitulo}>6. OPEN SOURCE</Text>
        <Text style={styles.seccionTexto}>
          ELI belongs to the community. The source code is public and anyone can review it, improve it, or create their own version.
        </Text>

        <Text style={styles.seccionTitulo}>7. MINIMUM AGE</Text>
        <Text style={styles.seccionTexto}>
          ELI is not intended for users under 16 years of age.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={styles.botones}>
        <TouchableOpacity
          style={styles.botonAceptar}
          accessibilityLabel="Aceptar términos de uso"
          accessibilityRole="button"
          onPress={aceptar}
        >
          <Text style={styles.botonAceptarTexto}>Acepto</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botonNoAceptar}
          accessibilityLabel="No aceptar términos de uso"
          accessibilityRole="button"
          onPress={noAceptar}
        >
          <Text style={styles.botonNoAceptarTexto}>No acepto</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.eli.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  logo: {
    color: Colors.eli.primary,
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: 12,
  },
  headerTitle: {
    color: Colors.eli.white,
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  version: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    marginBottom: 12,
  },
  intro: {
    color: Colors.eli.white,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  seccionTitulo: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
  seccionTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 8,
  },
  separadorIdioma: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 28,
    gap: 12,
  },
  linea: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.eli.border,
  },
  idiomaLabel: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  botones: {
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: Colors.eli.border,
    gap: 10,
  },
  botonAceptar: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  botonAceptarTexto: {
    color: Colors.eli.background,
    fontSize: 17,
    fontWeight: 'bold',
  },
  botonNoAceptar: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  botonNoAceptarTexto: {
    color: Colors.eli.grayLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
