// app.config.js
import 'dotenv/config';

export default {
  expo: {
    name: 'wanderMinds',
    slug: 'wanderMinds',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'myapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Allow WanderMinds to access your location for nearby stories.'
      },
      supportsTablet: true,
    },
    android: {
      permissions: ['ACCESS_FINE_LOCATION'],
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },

    // ← add this:
    extra: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    },
  },
};