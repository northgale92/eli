import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE_SEGUIDOS = 'eli_seguidos';

export async function seguirUsuario(usuario: string): Promise<void> {
  const seguidos = await obtenerSeguidos();
  if (!seguidos.includes(usuario)) {
    seguidos.push(usuario);
    await AsyncStorage.setItem(CLAVE_SEGUIDOS, JSON.stringify(seguidos));
  }
}

export async function dejarDeSeguir(usuario: string): Promise<void> {
  const seguidos = await obtenerSeguidos();
  const nuevos = seguidos.filter(u => u !== usuario);
  await AsyncStorage.setItem(CLAVE_SEGUIDOS, JSON.stringify(nuevos));
}

export async function obtenerSeguidos(): Promise<string[]> {
  try {
    const datos = await AsyncStorage.getItem(CLAVE_SEGUIDOS);
    return datos ? JSON.parse(datos) : [];
  } catch {
    return [];
  }
}

export async function estaSiguiendo(usuario: string): Promise<boolean> {
  const seguidos = await obtenerSeguidos();
  return seguidos.includes(usuario);
}
