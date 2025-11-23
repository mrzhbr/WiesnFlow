# Building WiesnFlow for Your Phone

This guide will help you build an APK (Android) or IPA (iOS) file that you can install on your phone.

## Prerequisites

1. **Expo Account**: You'll need a free Expo account. Sign up at https://expo.dev if you don't have one.

2. **EAS CLI**: Install the EAS CLI globally (or use npx):
   ```bash
   npm install -g eas-cli
   ```

3. **Login to Expo**:
   ```bash
   eas login
   ```

## Building for Android (APK)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Build the APK:
   ```bash
   npm run build:android
   ```
   Or directly:
   ```bash
   eas build --platform android --profile preview
   ```

3. The build will start on Expo's servers. You'll get a QR code and URL to track the build.

4. Once complete, download the APK from the Expo dashboard or the provided link.

5. **Install on Android**:
   - Transfer the APK to your phone
   - Enable "Install from Unknown Sources" in your phone's settings
   - Open the APK file and install

## Building for iOS

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Build for iOS:
   ```bash
   npm run build:ios
   ```
   Or directly:
   ```bash
   eas build --platform ios --profile preview
   ```

3. **Note**: iOS builds require an Apple Developer account ($99/year) for distribution. For testing, you can use Expo Go or TestFlight.

## Alternative: Using Expo Go (Easiest for Testing)

If you just want to test on your phone quickly without building:

1. Start the development server:
   ```bash
   npm start
   ```

2. Install "Expo Go" app from App Store (iOS) or Play Store (Android)

3. Scan the QR code that appears in your terminal with the Expo Go app

**Note**: Some native features might not work perfectly in Expo Go. For a production build, use EAS Build as described above.

## Build Profiles

- **preview**: Creates an APK/IPA for internal testing (no app store submission)
- **production**: Creates a build ready for app store submission

## Troubleshooting

- If you get authentication errors, make sure you're logged in: `eas login`
- If the build fails, check the build logs in the Expo dashboard
- Make sure your `app.config.ts` has all required fields filled in

