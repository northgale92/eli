// Debe ser el primer módulo que carga el bundle, antes que expo-router/entry:
// expo-router usa require.context en modo eager para construir el árbol de
// rutas, lo que requiere TODOS los archivos de app/ de forma síncrona antes
// de que app/_layout.tsx llegue a ejecutar su propio primer import. Como
// app/(tabs)/chat.tsx (que se resuelve alfabéticamente antes que _layout.tsx)
// importa services/chat.ts -> services/identidad.ts -> tweetnacl, tweetnacl
// evaluaba su detección de PRNG (self.crypto.getRandomValues) antes de que
// el polyfill se instalara, y lanzaba "no PRNG" en cualquier cifrado.
import 'react-native-get-random-values';
import 'expo-router/entry';
