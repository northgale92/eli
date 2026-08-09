import { Tabs, router } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.eli.primary,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarItemStyle: { paddingTop: 10 },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(30,30,30,0.85)',
          borderTopColor: 'rgba(0,201,177,0.15)',
          borderTopWidth: 1,
          height: 70 + insets.bottom,
          paddingBottom: 12 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="muro"
        options={{
          title: 'Muro',
          tabBarAccessibilityLabel: 'Muro, red social de ELI',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarAccessibilityLabel: 'Chat, mensajes privados cifrados',
        }}
      />
      <Tabs.Screen
        name="canales"
        options={{
          title: 'Canales',
          tabBarAccessibilityLabel: 'Canales, suscripciones de contenido',
        }}
      />
      <Tabs.Screen
        name="mercado"
        options={{
          title: 'Mercado',
          tabBarAccessibilityLabel: 'Mercado, tiendas verificadas',
        }}
      />
      <Tabs.Screen
        name="solidaria"
        options={{
          title: 'Solidaria',
          tabBarAccessibilityLabel: 'Solidaria, proyectos de ayuda comunitaria',
        }}
      />
      <Tabs.Screen
        name="inicio"
        options={{
          title: 'Inicio',
          tabBarAccessibilityLabel: 'Volver al inicio',
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => router.replace('/dashboard')}
            />
          ),
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
