import React from 'react';
import { Text, StyleSheet, Platform, useColorScheme, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
                tabBarStyle: {
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    elevation: 5,
                    backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                    opacity: 0.98,
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    height: 90,
                    shadowColor: '#000',
                    shadowOffset: {
                        width: 0,
                        height: -2,
                    },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    borderTopWidth: 0,
                    paddingTop: 10,
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
