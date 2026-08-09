import { useEffect } from 'react';
import { router } from 'expo-router';

export default function Inicio() {
  useEffect(() => {
    router.replace('/dashboard');
  }, []);

  return null;
}
