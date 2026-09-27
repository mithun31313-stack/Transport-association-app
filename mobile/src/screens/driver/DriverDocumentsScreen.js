import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import client from "../../api/client";
import { useAuth } from "../../api/AuthContext";

const DOC_TYPES = [
  { key: "AADHAR", label: "Aadhar Card" },
  { key: "PAN", label: "PAN Card" },
  { key: "LICENCE", label: "Driving Licence" },
];

export default function DriverDocumentsScreen() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [uploadingType, setUploadingType] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get(`/drivers/${user.driverId}/documents`);
      setDocs(data);
    } catch (err) {
      // empty state handled below
    }
  }, [user.driverId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function latestFor(type) {
    return docs.find((d) => d.type === type);
  }

  async function pickAndUpload(type) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload your document.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    setUploadingType(type);
    try {
      await client.post(`/drivers/${user.driverId}/documents`, {
        type,
        fileBase64: result.assets[0].base64,
        mimeType: "image/jpeg",
      });
      Alert.alert("Uploaded", "Document submitted for review.");
      load();
    } catch (err) {
      Alert.alert("Upload failed", err.error || "Could not upload document");
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Documents</Text>
      <Text style={styles.subtitle}>Upload clear photos of each document. An admin will verify them before your account is approved.</Text>

      {DOC_TYPES.map(({ key, label }) => {
        const existing = latestFor(key);
        return (
          <View key={key} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.docLabel}>{label}</Text>
              {existing && <Text style={[styles.badge, badgeStyle(existing.status)]}>{existing.status}</Text>}
            </View>
            {existing?.fileUrl && <Image source={{ uri: existing.fileUrl }} style={styles.preview} resizeMode="cover" />}
            <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndUpload(key)} disabled={uploadingType === key}>
              {uploadingType === key ? (
                <ActivityIndicator color="#0F3D5C" />
              ) : (
                <Text style={styles.uploadBtnText}>{existing ? "Re-upload" : "Upload"}</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

function badgeStyle(status) {
  if (status === "EXPIRED") return { color: "#C0392B" };
  if (status === "EXPIRING_SOON") return { color: "#D68910" };
  return { color: "#1E8449" };
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 40, backgroundColor: "#F4F6F8" },
  title: { fontSize: 20, fontWeight: "700", color: "#0F3D5C", marginBottom: 4 },
  subtitle: { color: "#666", fontSize: 13, marginBottom: 20, lineHeight: 18 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  docLabel: { fontWeight: "700", fontSize: 15 },
  badge: { fontSize: 11, fontWeight: "700" },
  preview: { width: "100%", height: 140, borderRadius: 8, marginBottom: 10, backgroundColor: "#EEE" },
  uploadBtn: { borderWidth: 1, borderColor: "#0F3D5C", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  uploadBtnText: { color: "#0F3D5C", fontWeight: "700" },
});
