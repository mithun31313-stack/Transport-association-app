import React, { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import client from "../../api/client";
import { useAuth } from "../../api/AuthContext";

export default function DriverProfileScreen() {
  const { user, logout } = useAuth();
  const [driver, setDriver] = useState(null);
  const [bankForm, setBankForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifsc: "", branch: "" });

  const load = useCallback(async () => {
    try {
      const { data } = await client.get(`/drivers/${user.driverId}`);
      setDriver(data);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load profile");
    }
  }, [user.driverId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function submitBank() {
    const { accountHolderName, bankName, accountNumber, ifsc } = bankForm;
    if (!accountHolderName || !bankName || !accountNumber || !ifsc) {
      Alert.alert("Missing details", "Fill in all required bank fields.");
      return;
    }
    try {
      await client.put(`/drivers/${user.driverId}/bank`, bankForm);
      Alert.alert("Submitted", "Your bank details were submitted for verification.");
      load();
    } catch (err) {
      Alert.alert("Error", err.error || "Could not submit bank details");
    }
  }

  async function uploadPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to set your profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    try {
      await client.put(`/drivers/${user.driverId}/profile-photo`, {
        fileBase64: result.assets[0].base64,
        mimeType: "image/jpeg",
      });
      load();
    } catch (err) {
      Alert.alert("Upload failed", err.error || "Could not update photo");
    }
  }

  if (!driver) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={logout}><Text style={styles.logout}>Logout</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.photoWrap} onPress={uploadPhoto}>
        {driver.profilePhotoUrl ? (
          <Image source={{ uri: driver.profilePhotoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoInitial}>{driver.fullName?.[0] || "?"}</Text>
          </View>
        )}
        <Text style={styles.photoLink}>Change photo</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Row label="Name" value={driver.fullName} />
        <Row label="Phone" value={driver.phone} />
        <Row label="Employee ID" value={driver.employeeId} />
        <Row label="Licence" value={driver.licenceNumber || "—"} />
      </View>

      <Text style={styles.sectionTitle}>Bank Details</Text>
      <View style={styles.card}>
        {driver.bankAccount ? (
          <>
            <Row label="Bank" value={driver.bankAccount.bankName} />
            <Row label="Account" value={driver.bankAccount.maskedAccountNumber} />
            <Row label="IFSC" value={driver.bankAccount.ifsc} />
            <Row label="Status" value={driver.bankAccount.verificationStatus} />
          </>
        ) : (
          <Text style={styles.meta}>No bank details submitted yet.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Update Bank Details</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Account Holder Name" value={bankForm.accountHolderName} onChangeText={(t) => setBankForm({ ...bankForm, accountHolderName: t })} />
        <TextInput style={styles.input} placeholder="Bank Name" value={bankForm.bankName} onChangeText={(t) => setBankForm({ ...bankForm, bankName: t })} />
        <TextInput style={styles.input} placeholder="Account Number" keyboardType="number-pad" value={bankForm.accountNumber} onChangeText={(t) => setBankForm({ ...bankForm, accountNumber: t })} />
        <TextInput style={styles.input} placeholder="IFSC" autoCapitalize="characters" value={bankForm.ifsc} onChangeText={(t) => setBankForm({ ...bankForm, ifsc: t })} />
        <TextInput style={styles.input} placeholder="Branch" value={bankForm.branch} onChangeText={(t) => setBankForm({ ...bankForm, branch: t })} />
        <TouchableOpacity style={styles.submitBtn} onPress={submitBank}>
          <Text style={styles.submitBtnText}>SUBMIT FOR VERIFICATION</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 48, backgroundColor: "#F4F6F8" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#0F3D5C" },
  logout: { color: "#C0392B", fontWeight: "600" },
  photoWrap: { alignItems: "center", marginBottom: 16 },
  photo: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#EEE" },
  photoPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#0F3D5C" },
  photoInitial: { color: "#fff", fontSize: 30, fontWeight: "700" },
  photoLink: { color: "#0F3D5C", fontWeight: "600", fontSize: 12, marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  rowLabel: { color: "#666" },
  rowValue: { fontWeight: "600" },
  meta: { color: "#888" },
  input: { backgroundColor: "#F4F6F8", borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#DDD" },
  submitBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 14, alignItems: "center" },
  submitBtnText: { color: "#fff", fontWeight: "700" },
});
