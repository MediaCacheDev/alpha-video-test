import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { parsePixelTestUrl, type PixelTestCase } from '../../testing/pixels/screen';
import { parseStreamTestUrl, type StreamTestCase } from '../../testing/streaming/link';
import { PixelTestScreen } from './PixelTestScreen';
import { StreamTestScreen } from '../streamtest/StreamTestScreen';

type TestRoute =
  | { kind: 'pixel'; testCase: PixelTestCase }
  | { kind: 'stream'; testCase: StreamTestCase };

function routeFor(url: string | null | undefined): TestRoute | null {
  const pixel = parsePixelTestUrl(url);
  if (pixel) return { kind: 'pixel', testCase: pixel };
  const stream = parseStreamTestUrl(url);
  return stream ? { kind: 'stream', testCase: stream } : null;
}

/**
 * Wraps the app so that an `alphavideotest://pixeltest?…` link (see testing/pixels) or an
 * `alphavideotest://streamtest?…` link (see testing/streaming), at launch or later, replaces it
 * with that test's screen.
 */
export function withPixelTest(App: React.ComponentType): React.ComponentType {
  return function PixelTestRoot() {
    const [state, setState] = useState<{ ready: boolean; route: TestRoute | null }>({ ready: false, route: null });

    useEffect(() => {
      Linking.getInitialURL().then((url) => {
        setState((s) => (s.ready ? s : { ready: true, route: routeFor(url) }));
      });
      const subscription = Linking.addEventListener('url', ({ url }) => {
        const route = routeFor(url);
        if (route) setState({ ready: true, route });
      });
      return () => subscription.remove();
    }, []);

    if (!state.ready) return null;
    if (state.route?.kind === 'pixel') return <PixelTestScreen testCase={state.route.testCase} />;
    if (state.route?.kind === 'stream') return <StreamTestScreen testCase={state.route.testCase} />;
    return <App />;
  };
}
