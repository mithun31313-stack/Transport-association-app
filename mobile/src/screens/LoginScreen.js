import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useAuth } from "../api/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!identifier || !password) {
      Alert.alert("Missing details", "Enter phone/email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (err) {
      Alert.alert("Login failed", err.error || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transport Association</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <TextInput
        style={styles.input}
        placeholder="Phone or email"
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>LOGIN</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => Alert.alert("Forgot password", "Contact your association admin to reset your password.")}>
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F4F6F8" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", color: "#0F3D5C" },
  subtitle: { fontSize: 14, textAlign: "center", color: "#666", marginBottom: 32, marginTop: 4 },
  input: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#DDD" },
  button: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: "#0F3D5C", textAlign: "center", marginTop: 16 },
});
