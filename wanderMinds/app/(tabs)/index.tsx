import React from "react";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ExplorerScreen from "../screens/ExplorerScreen";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ExplorerScreen />
    </GestureHandlerRootView>
  );
}
