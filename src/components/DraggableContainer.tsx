import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';

interface DraggableContainerProps {
  id: string;
  type: 'ktx2' | 'ktx2uncompressed' | 'webm' | 'webmcpp' | 'exovp9alpha' | 'apng' | 'avif';
  initialX: number;
  initialY: number;
  zIndex: number;
  onZIndexChange: (id: string, newZIndex: number) => void;
  onRemove: (id: string) => void;
  children: React.ReactNode;
}

export const DraggableContainer: React.FC<DraggableContainerProps> = ({
  id,
  type,
  initialX,
  initialY,
  zIndex,
  onZIndexChange,
  onRemove,
  children,
}) => {
  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const [localZIndex, setLocalZIndex] = React.useState(String(zIndex));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  const handleZIndexUp = () => {
    const newZ = zIndex + 1;
    setLocalZIndex(String(newZ));
    onZIndexChange(id, newZ);
  };

  const handleZIndexDown = () => {
    const newZ = Math.max(0, zIndex - 1);
    setLocalZIndex(String(newZ));
    onZIndexChange(id, newZ);
  };

  const handleZIndexInput = (text: string) => {
    setLocalZIndex(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 0) {
      onZIndexChange(id, num);
    }
  };

  const typeColor = type === 'ktx2' ? '#4CAF50' : type === 'webm' ? '#2196F3' : type === 'webmcpp' ? '#00BCD4' : type === 'apng' ? '#9C27B0' : '#FF5722';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: pan.getTranslateTransform(),
          zIndex,
          borderColor: typeColor,
        },
      ]}
    >
      {/* Header with grip and controls */}
      <View style={[styles.header, { backgroundColor: 'transparent' }]}>
        {/* Grip handle */}
        <View {...panResponder.panHandlers} style={styles.gripArea}>
          <Text style={styles.gripIcon}>✋</Text>
          <Text style={styles.typeLabel}>{type === 'ktx2' ? 'ASTC' : type === 'webmcpp' ? 'WEBM-C++' : type.toUpperCase()}</Text>
        </View>

        {/* Z-Index controls */}
        <View style={styles.zIndexControls}>
          <TouchableOpacity onPress={handleZIndexDown} style={styles.zButton}>
            <Text style={styles.zButtonText}>▼</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.zIndexInput}
            value={localZIndex}
            onChangeText={handleZIndexInput}
            keyboardType="numeric"
            selectTextOnFocus
          />
          <TouchableOpacity onPress={handleZIndexUp} style={styles.zButton}>
            <Text style={styles.zButtonText}>▲</Text>
          </TouchableOpacity>
        </View>

        {/* Close button */}
        <TouchableOpacity onPress={() => onRemove(id)} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>{children}</View>

      {/* Footer with ID */}
      <View style={styles.footer}>
        <Text style={styles.idText}>#{id.slice(-4)} | z:{zIndex}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    minWidth: 150,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  gripArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  gripIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  typeLabel: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  zIndexControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  zButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  zButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  zIndexInput: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    color: 'white',
    width: 36,
    height: 24,
    textAlign: 'center',
    borderRadius: 4,
    fontSize: 12,
    paddingVertical: 0,
  },
  closeButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  idText: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
  },
});
