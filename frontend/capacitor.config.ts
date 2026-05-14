import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.openstream.app',
  appName: 'OpenStream',
  webDir: 'dist/openstream',
  server: {
    androidScheme: 'https'
  }
};

export default config;
