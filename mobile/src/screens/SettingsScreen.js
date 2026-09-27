import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import client from "../api/client";
import { useAuth } from "../api/AuthContext";

const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "ta", label: "தமிழ் (Tamil)" },
];

export default function SettingsScreen() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [language, setLanguage] = useState("en");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveEmail() {
    if (!email.includes("@")) {
      Alert.alert("Enter a valid email");
      return;
    }
    setSavingEmail(true);
    try {
      await client.put("/auth/change-email", { email });
      Alert.alert("Saved", "Email updated.");
      setEmail("");
    } catch (err) {
      Alert.alert("Error", err.error || "Could not update email");
    } finally {
      setSavingEmail(false);
    }
  }

  async function savePassword() {
    if (!currentPassword || newPassword.length < 8) {
      Alert.alert("Check your entries", "Enter your current password, and a new one at least 8 characters long.");
      return;
    }
    setSavingPassword(true);
    try {
      await client.put("/auth/change-password", { currentPassword, newPassword });
      Alert.alert("Saved", "Password updated. Use it next time you log in.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      Alert.alert("Error", err.error || "Could not update password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveLanguage(lang) {
    setLanguage(lang);
    try {
      await client.put("/auth/change-language", { language: lang });
    } catch (err) {
      Alert.alert("Error", err.error || "Could not save language preference");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Change Email</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="New email address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <TouchableOpacity style={styles.btn} onPress={saveEmail} disabled={savingEmail}>
          <Text style={styles.btnText}>{savingEmail ? "Saving…" : "SAVE EMAIL"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Change Password</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
        <TextInput style={styles.input} placeholder="New password (min 8 characters)" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
        <TouchableOpacity style={styles.btn} onPress={savePassword} disabled={savingPassword}>
          <Text style={styles.btnText}>{savingPassword ? "Saving…" : "SAVE PASSWORD"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Language</Text>
      <View style={styles.card}>
        <View style={styles.langRow}>
          {LANGUAGES.map((l) => (
            <TouchableOpacity
              key={l.key}
              style={[styles.langChip, language === l.key && styles.langChipActive]}
              onPress={() => saveLanguage(l.key)}
            >
              <Text style={[styles.langText, language === l.key && styles.langTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.langNote}>
          This saves your preference, but the app's screens are only available in English right now — full Tamil
          translation isn't built yet.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F4F6F8" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 8 },
  input: { backgroundColor: "#F4F6F8", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#DDD", marginBottom: 10 },
  btn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  langRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  langChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#DDD", alignItems: "center" },
  langChipActive: { backgroundColor: "#0F3D5C", borderColor: "#0F3D5C" },
  langText: { color: "#666", fontWeight: "600", fontSize: 13 },
  langTextActive: { color: "#fff" },
  langNote: { fontSize: 11, color: "#999", lineHeight: 16 },
});
