import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import client from "../api/client";

export default function ForgotPasswordScreen({ navigation }) {
  const [identifier, setIdentifier] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    if (!identifier) {
      Alert.alert("Enter your phone or email");
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post("/auth/forgot-password", { identifier });
      setOtpRequested(true);
      // No SMS/email provider is connected yet, so the OTP is shown directly here for now.
      if (data.demoOtp) {
        Alert.alert("Your OTP", `${data.demoOtp}\n\n(This is shown directly because SMS/email sending isn't set up yet.)`);
      } else {
        Alert.alert("Check your account", data.message || "If that account exists, an OTP has been generated.");
      }
    } catch (err) {
      Alert.alert("Error", err.error || "Could not request OTP");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!otp || newPassword.length < 8) {
      Alert.alert("Check your entries", "Enter the OTP and a new password at least 8 characters long.");
      return;
    }
    setLoading(true);
    try {
      await client.post("/auth/reset-password", { identifier, otp, newPassword });
      Alert.alert("Password reset", "You can now log in with your new password.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>Enter your phone or email to get a one-time code.</Text>

      <TextInput
        style={styles.input}
        placeholder="Phone or email"
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
        editable={!otpRequested}
      />

      {!otpRequested ? (
        <TouchableOpacity style={styles.button} onPress={requestOtp} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>SEND OTP</Text>}
        </TouchableOpacity>
      ) : (
        <>
          <TextInput style={styles.input} placeholder="Enter OTP" keyboardType="number-pad" value={otp} onChangeText={setOtp} />
          <TextInput
            style={styles.input}
            placeholder="New password (min 8 characters)"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TouchableOpacity style={styles.button} onPress={resetPassword} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>RESET PASSWORD</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={requestOtp}>
            <Text style={styles.link}>Resend OTP</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#F4F6F8" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", color: "#0F3D5C" },
  subtitle: { fontSize: 13, textAlign: "center", color: "#666", marginBottom: 24, marginTop: 4 },
  input: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#DDD" },
  button: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { color: "#0F3D5C", textAlign: "center", marginTop: 16 },
});
