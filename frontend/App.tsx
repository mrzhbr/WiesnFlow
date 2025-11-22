import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './src/navigation/TabNavigator';
import { SecurityModeProvider } from './src/contexts/SecurityModeContext';

export default function App() {
  return (
    <SecurityModeProvider>
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
    </SecurityModeProvider>
  );
}
