import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import client, { saveSession } from "../api/client";
import { useAuth } from "../api/AuthContext";

export default function DriverSignupScreen({ navigation }) {
  const { setUserDirect } = useAuth();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "", licenceNumber: "" });
  const [loading, setLoading] = useState(false);

  function set(key, value) {
    setForm({ ...form, [key]: value });
  }

  async function handleSignup() {
    if (!form.fullName || !form.phone || !form.password) {
      Alert.alert("Missing details", "Name, phone, and password are required.");
      return;
    }
    if (form.password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post("/auth/register-driver", form);
      await saveSession(data.token, data.user);
      Alert.alert(
        "Account created",
        "Your account is pending approval. Please upload your documents (Aadhar, PAN, Licence) next — an admin will review them before you can be assigned a vehicle or paid.",
        [{ text: "OK", onPress: () => setUserDirect(data.user) }]
      );
    } catch (err) {
      Alert.alert("Signup failed", err.error || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Driver Account</Text>
      <Text style={styles.subtitle}>Sign up, then upload your documents for approval.</Text>

      <TextInput style={styles.input} placeholder="Full Name *" value={form.fullName} onChangeText={(t) => set("fullName", t)} />
      <TextInput style={styles.input} placeholder="Phone *" keyboardType="phone-pad" value={form.phone} onChangeText={(t) => set("phone", t)} />
      <TextInput style={styles.input} placeholder="Email (optional)" autoCapitalize="none" value={form.email} onChangeText={(t) => set("email", t)} />
      <TextInput style={styles.input} placeholder="Password (min 8 characters) *" secureTextEntry value={form.password} onChangeText={(t) => set("password", t)} />
      <TextInput style={styles.input} placeholder="Licence Number (optional)" value={form.licenceNumber} onChangeText={(t) => set("licenceNumber", t)} />

      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>CREATE ACCOUNT</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#F4F6F8" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", color: "#0F3D5C" },
  subtitle: { fontSize: 13, textAlign: "center", color: "#666", marginBottom: 24, marginTop: 4 },
  input: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#DDD" },
  button: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: "#0F3D5C", textAlign: "center", marginTop: 18 },
});
