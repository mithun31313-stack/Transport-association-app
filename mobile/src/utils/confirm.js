import { Platform, Alert } from "react-native";

// React Native's Alert.alert doesn't reliably invoke a specific button's onPress
// when running via react-native-web (it falls back to a plain window.alert with
// no real button distinction) — so a "Cancel / Delete" dialog silently does
// nothing on the browser-preview build. This wraps both paths so confirmations
// work the same whether you're testing in a browser or on a real phone.
export function confirmAction(title, message, onConfirm, confirmLabel = "Delete") {
  if (Platform.OS === "web") {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
