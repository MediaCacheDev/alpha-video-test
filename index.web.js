import { AppRegistry } from 'react-native';
import { registerRangeSourceWorker } from 'alpha-video-web';
import App from './App';
import { name as appName } from './app.json';

// Fix react-native-web z-index issue (all Views get z-index: 0 which breaks stacking)
const style = document.createElement('style');
style.textContent = `
  /* Fix z-index: 0 on all Views - target common RNW class patterns */
  [class*="css-view-"], [class*="css-"][class*="-r"] {
    z-index: auto;
  }
`;
document.head.appendChild(style);

// Register the app
AppRegistry.registerComponent(appName, () => App);

// The range-source worker streams and stores what <video> plays. Rendering waits until it controls
// the page, so the first player's requests go through it too.
async function start() {
  await registerRangeSourceWorker?.('/range-source-sw.js').catch((e) => console.warn('range-source worker:', e));
  AppRegistry.runApplication(appName, {
    rootTag: document.getElementById('root'),
  });
}
start();
