import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../constants/Colors';

export default function Manifiesto() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Sobre ELI</Text>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.ojo}>◎</Text>
        <Text style={styles.titulo}>Manifiesto</Text>
        <Text style={styles.subtitulo}>ESSENTIAL LIFE INTELLIGENCE</Text>
        <View style={styles.caja}>
          <Text style={styles.texto}>
            ELI nació con la convicción de que un{' '}
            <Text style={styles.destacado}>internet libre, privado y solidario</Text>
            {' '}es posible. La estructura está levantada. Pero para que ELI sea completamente indestructible os necesitamos a vosotros.{'\n\n'}
            A los{' '}
            <Text style={styles.destacado}>hackers éticos</Text>
            , a los <Text style={styles.destacado}>amantes del código abierto</Text>, a los <Text style={styles.destacado}>ingenieros</Text> que creen que la tecnología debe servir a la humanidad y no a los monopolios.{'\n\n'}
            <Text style={styles.destacado}>El código es vuestro.</Text>
            {' '}Revisadlo, pulid los errores, blindad la seguridad y haced que esta red pueda volar más alto.{'\n\n'}
            No hay empresas detrás, no hay jefes.{' '}
            <Text style={styles.destacado}>ELI es de la comunidad.</Text>
            {' '}Ayudadla y protegedla.
          </Text>
        </View>
        <View style={styles.fraseBox}>
          <Text style={styles.frase}>
            " Vamos a cambiar el mundo."
          </Text>
        </View>

        <View style={styles.separador}>
          <Text style={styles.separadorTexto}>English</Text>
        </View>
        <View style={styles.caja}>
          <Text style={styles.texto}>
            ELI was born with the conviction that a{' '}
            <Text style={styles.destacado}>free, private, and caring internet</Text>
            {' '}is possible. The foundation has been built. But for ELI to be truly indestructible, we need you.{'\n\n'}
            To the{' '}
            <Text style={styles.destacado}>ethical hackers</Text>
            {', the '}<Text style={styles.destacado}>open-source believers</Text>{', the '}
            <Text style={styles.destacado}>engineers</Text>
            {' '}who think technology should serve humanity and not monopolies.{'\n\n'}
            <Text style={styles.destacado}>The code is yours.</Text>
            {' '}Review it, fix the bugs, fortify the security, and help this network fly higher.{'\n\n'}
            There are no companies behind this, no bosses.{' '}
            <Text style={styles.destacado}>ELI belongs to the community.</Text>
            {' '}Support it and protect it.
          </Text>
        </View>

        <View style={styles.fraseBox}>
          <Text style={styles.frase}>
            "We are going to change the world."
          </Text>
        </View>
        <Text style={styles.version}>ELI v1.0 — Código abierto — Para el mundo</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
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
    padding: 20,
  },
  ojo: {
    fontSize: 64,
    color: Colors.eli.primary,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  titulo: {
    color: Colors.eli.white,
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitulo: {
    color: Colors.eli.primary,
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 24,
  },
  caja: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
    marginBottom: 20,
  },
  cajaDecision: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
    marginBottom: 20,
  },
  decisionTitulo: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  decisionTexto: {
    color: '#9A9AB0',
    fontSize: 14,
    lineHeight: 24,
  },
  texto: {
    color: '#9A9AB0',
    fontSize: 14,
    lineHeight: 24,
  },
  destacado: {
    color: Colors.eli.white,
    fontWeight: '600',
  },
  fraseBox: {
    backgroundColor: Colors.eli.background,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    marginBottom: 20,
  },
  frase: {
    color: Colors.eli.primary,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  version: {
    color: '#444455',
    fontSize: 11,
    textAlign: 'center',
  },
  separador: {
    alignItems: 'center',
    marginVertical: 24,
  },
  separadorTexto: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
