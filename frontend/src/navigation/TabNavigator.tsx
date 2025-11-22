import React from 'react';
import { Text, StyleSheet, Platform, useColorScheme, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { HomeScreen } from '../screens/HomeScreen';
import {LocationTrackerScreen} from '../screens/LocationTrackerScreen';
import { FriendsScreen } from '../screens/FriendsScreen';

const Tab = createBottomTabNavigator();

export const TabNavigator = () => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarShowLabel: false,
                tabBarBackground: () => (
                    Platform.OS === 'ios' ? (
                        <BlurView
                            tint="systemThickMaterial"
                            style={StyleSheet.absoluteFill}
                        />
                    ) : undefined
                ),
                tabBarStyle: {
                    position: 'absolute',
                    bottom: 40,
                    left: 40,
                    right: 40,
                    elevation: 5,
                    backgroundColor: Platform.OS === 'ios' ? 'transparent' : (isDark ? '#1a1a1a' : '#ffffff'),
                    borderRadius: 35,
                    height: 70,
                    shadowColor: '#000',
                    shadowOffset: {
                        width: 0,
                        height: 4,
                    },
                    shadowOpacity: 0.25,
                    shadowRadius: 3.5,
                    borderTopWidth: 0,
                    overflow: 'hidden',
                },
                tabBarIcon: ({ focused }) => {
                    return (
                        <View style={{ 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            top: Platform.OS === 'ios' ? 10 : 0,
                            backgroundColor: focused ? (isDark ? '#333333' : '#f0f0f0') : 'transparent',
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                        }}>
                            <Text style={{ fontSize: 30 }}>
                                {route.name === 'Home' ? '🗺️' : route.name === 'Location' ? '📍' : '👥'}
                            </Text>
                        </View>
                    );
                },
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Location" component={LocationTrackerScreen} />
            <Tab.Screen name="Friends" component={FriendsScreen} />
        </Tab.Navigator>
    );
};
