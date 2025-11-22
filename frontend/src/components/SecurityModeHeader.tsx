import React from 'react';
import { View, Text, StyleSheet, Switch, useColorScheme, Platform } from 'react-native';
import { useSecurityMode } from '../contexts/SecurityModeContext';

export const SecurityModeHeader: React.FC = () => {
  const { isSecurityMode, toggleSecurityMode } = useSecurityMode();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <>
      {/* Security Mode Banner */}
      {isSecurityMode && (
        <View style={styles.securityBanner}>
          <Text style={styles.securityBannerText}>
            Security Personnel Mode Active
          </Text>
        </View>
      )}
      
      {/* Toggle Switch */}
      <View style={[
        styles.toggleContainer,
        { top: isSecurityMode ? 94 : (Platform.OS === 'ios' ? 60 : 50) }
      ]}>
        <View style={[
          styles.toggleWrapper,
          isDark ? styles.toggleWrapperDark : styles.toggleWrapperLight
        ]}>
          <Switch
            value={isSecurityMode}
            onValueChange={toggleSecurityMode}
            trackColor={{ 
              false: isDark ? '#374151' : '#d1d5db', 
              true: '#dc2626' 
            }}
            thumbColor={isSecurityMode ? '#ffffff' : '#f3f4f6'}
            ios_backgroundColor={isDark ? '#374151' : '#d1d5db'}
          />
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  securityBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#dc2626',
    paddingTop: Platform.OS === 'ios' ? 60 : 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  securityBannerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  toggleContainer: {
    position: 'absolute',
    left: 6,
    zIndex: 1001,
  },
  toggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleWrapperLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  toggleWrapperDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.95)',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: '#dc2626',
  },
  textLight: {
    color: '#e5e7eb',
  },
  textDark: {
    color: '#0f172a',
  },
});
