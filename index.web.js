import { AppRegistry } from 'react-native';
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

// Run the app on web
AppRegistry.runApplication(appName, {
  rootTag: document.getElementById('root'),
});
