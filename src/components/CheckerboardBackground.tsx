import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';

const TILE_SIZE = 20;

export const CheckerboardBackground: React.FC = () => {
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    // On web, use viewport dimensions if Dimensions returns 0
    if (Platform.OS === 'web' && (width === 0 || height === 0)) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width, height };
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (Platform.OS === 'web') {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      } else {
        const { width, height } = Dimensions.get('window');
        setDimensions({ width, height });
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    } else {
      const subscription = Dimensions.addEventListener('change', updateDimensions);
      return () => subscription?.remove();
    }
  }, []);

  // On web, use CSS background pattern for better performance
  if (Platform.OS === 'web') {
    return (
      <View 
        style={[
          styles.container, 
          { 
            // @ts-ignore - web-specific CSS
            backgroundImage: `
              linear-gradient(45deg, #c0c0c0 25%, transparent 25%),
              linear-gradient(-45deg, #c0c0c0 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #c0c0c0 75%),
              linear-gradient(-45deg, transparent 75%, #c0c0c0 75%)
            `,
            backgroundColor: '#e0e0e0',
            backgroundSize: `${TILE_SIZE * 2}px ${TILE_SIZE * 2}px`,
            backgroundPosition: `0 0, 0 ${TILE_SIZE}px, ${TILE_SIZE}px -${TILE_SIZE}px, -${TILE_SIZE}px 0px`,
          }
        ]} 
      />
    );
  }

  // Native: use View tiles
  const cols = Math.ceil(dimensions.width / TILE_SIZE);
  const rows = Math.ceil(dimensions.height / TILE_SIZE);
  
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isLight = (row + col) % 2 === 0;
      tiles.push(
        <View
          key={`${row}-${col}`}
          style={[
            styles.tile,
            { backgroundColor: isLight ? '#e0e0e0' : '#c0c0c0' },
          ]}
        />
      );
    }
  }
  
  return (
    <View style={styles.container}>
      <View style={[styles.grid, { width: cols * TILE_SIZE }]}>
        {tiles}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    // Ensure absolute positioning works on web
    ...(Platform.OS === 'web' ? { 
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    } : {}),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
});
