# Building WiesnFlow for iPhone (Without Paid Apple Developer Account)

You have **two options** for getting the app on your iPhone. Choose based on your needs:

## Option 1: Development Build (BEST PERFORMANCE) ⚡

This creates a standalone app with full native performance. Works with a **free Apple ID**, but expires after 7 days (then rebuild).

### Steps:

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**:
   ```bash
   cd frontend
   eas login
   ```

3. **Configure your Apple ID** (free account works!):
   ```bash
   eas build:configure
   ```
   When prompted, choose to use your Apple ID credentials.

4. **Build the development version**:
   ```bash
   npm run build:ios:dev
   ```
   Or directly:
   ```bash
   eas build --platform ios --profile development
   ```

5. **Install on your iPhone**:
   - Once the build completes, you'll get a link
   - Open the link on your iPhone
   - Tap "Install" - the app will download and install
   - Go to Settings > General > VPN & Device Management
   - Trust your developer certificate
   - Open the app!

**Note**: The app will expire after 7 days. Just rebuild it (step 4) to get another 7 days. This is free and unlimited!

---

## Option 2: Expo Go (EASIEST, Good Performance) 📱

Quick testing without building. Uses the Expo Go app from the App Store.

### Steps:

1. **Install Expo Go** on your iPhone from the App Store (it's free)

2. **Start the development server**:
   ```bash
   cd frontend
   npm start
   ```

3. **Connect your phone**:
   - Make sure your iPhone and computer are on the same WiFi network
   - Scan the QR code that appears in your terminal with the Expo Go app
   - Or shake your phone and select "Enter URL manually" and enter the URL shown

4. **That's it!** The app loads in Expo Go

**Pros**: 
- Instant updates when you change code
- No build needed
- Works immediately

**Cons**:
- Slightly less performant than a standalone build
- Requires Expo Go app to be installed
- Some very advanced native features might not work perfectly

---

## Recommendation

- **For best performance**: Use **Option 1 (Development Build)**
- **For quick testing/development**: Use **Option 2 (Expo Go)**

Both work great! The development build gives you a real standalone app experience, while Expo Go is perfect for rapid iteration during development.

## Troubleshooting

### Development Build Issues:
- **"No Apple Developer account"**: You can use a free Apple ID! Just enter your Apple ID email/password when prompted
- **App won't install**: Make sure you trust the developer certificate in Settings > General > VPN & Device Management
- **Build fails**: Check that your `app.config.ts` has all required iOS fields

### Expo Go Issues:
- **Can't connect**: Make sure both devices are on the same WiFi network
- **QR code doesn't work**: Try entering the URL manually in Expo Go (shake phone > Enter URL manually)

