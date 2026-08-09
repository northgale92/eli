import { Redirect } from 'expo-router';

// expo-router necesita una ruta "index" real en la raíz para resolver el
// arranque en frío (path vacío, sin deep link): unstable_settings.anchor por
// sí solo no basta porque matchForEmptyPath() en el resolutor de rutas solo
// empareja hojas con path === '' — sin este archivo, cae en el catch-all
// "+not-found" y la app queda tapada por la splash nativa para siempre.
export default function Index() {
  return <Redirect href="/terminos" />;
}
