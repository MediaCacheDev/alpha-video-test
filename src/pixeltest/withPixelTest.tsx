import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { parsePixelTestUrl, type PixelTestCase } from '../../testing/pixels/screen';
import { PixelTestScreen } from './PixelTestScreen';

/**
 * Wraps the app so that an `alphavideotest://pixeltest?…` link, at launch or later, replaces it
 * with the pixel-test screen (see testing/pixels).
 */
export function withPixelTest(App: React.ComponentType): React.ComponentType {
  return function PixelTestRoot() {
    const [state, setState] = useState<{ ready: boolean; testCase: PixelTestCase | null }>({ ready: false, testCase: null });

    useEffect(() => {
      Linking.getInitialURL().then((url) => {
        setState((s) => (s.ready ? s : { ready: true, testCase: parsePixelTestUrl(url) }));
      });
      const subscription = Linking.addEventListener('url', ({ url }) => {
        const testCase = parsePixelTestUrl(url);
        if (testCase) setState({ ready: true, testCase });
      });
      return () => subscription.remove();
    }, []);

    if (!state.ready) return null;
    return state.testCase ? <PixelTestScreen testCase={state.testCase} /> : <App />;
  };
}
