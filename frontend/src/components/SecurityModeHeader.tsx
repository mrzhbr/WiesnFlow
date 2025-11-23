import React from 'react';
import { View, StyleSheet, Switch, useColorScheme, Platform, Text } from 'react-native';
import { useSecurityMode } from '../contexts/SecurityModeContext';

export const SecurityModeHeader: React.FC = () => {
  const { isSecurityMode, toggleSecurityMode } = useSecurityMode();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <>
      {/* Red Top Bar when Security Mode is Active */}
      {isSecurityMode && (
        <View style={styles.securityBar}>
          <Text style={styles.securityBarText}>Security Mode Active</Text>
        </View>
      )}
      
      {/* Toggle Switch */}
      <View style={styles.toggleContainer}>
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
  securityBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 100 : 50,
    backgroundColor: '#dc2626',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  securityBarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    right: 16,
    zIndex: 1001,
  },
  toggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
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
});
