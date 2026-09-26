import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Alert, TextInput } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";
import { confirmAction } from "../../utils/confirm";

const DOC_LABELS = { AADHAR: "Aadhar", PAN: "PAN", LICENCE: "Licence" };

export default function PendingDriversScreen() {
  const [pending, setPending] = useState([]);
  const [employeeIds, setEmployeeIds] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/drivers/pending/list");
      setPending(data);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load pending drivers");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function approve(driverId) {
    try {
      await client.post(`/drivers/${driverId}/approve`, { employeeId: employeeIds[driverId] || undefined });
      Alert.alert("Approved", "Driver account is now active.");
      load();
    } catch (err) {
      Alert.alert("Error", err.error || "Could not approve driver");
    }
  }

  function rejectPrompt(driverId) {
    confirmAction("Reject application?", "This driver won't be able to work or get paid.", async () => {
      try {
        await client.post(`/drivers/${driverId}/reject`, { reason: "Documents did not verify" });
        load();
      } catch (err) {
        Alert.alert("Error", err.error || "Could not reject driver");
      }
    }, "Reject");
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 12 }}
      data={pending}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.fullName}</Text>
          <Text style={styles.meta}>{item.phone} · Signed up {new Date(item.createdAt).toLocaleDateString("en-IN")}</Text>

          <View style={styles.docsRow}>
            {["AADHAR", "PAN", "LICENCE"].map((type) => {
              const doc = item.documents?.find((d) => d.type === type);
              return (
                <View key={type} style={styles.docBox}>
                  <Text style={styles.docLabel}>{DOC_LABELS[type]}</Text>
                  {doc ? (
                    <Image source={{ uri: doc.fileUrl }} style={styles.docImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.docImg, styles.docMissing]}>
                      <Text style={styles.docMissingText}>Not uploaded</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <TextInput
            style={styles.input}
            placeholder={`Employee ID (optional, currently ${item.employeeId})`}
            onChangeText={(t) => setEmployeeIds({ ...employeeIds, [item.id]: t })}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => approve(item.id)}>
              <Text style={styles.approveBtnText}>APPROVE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectPrompt(item.id)}>
              <Text style={styles.rejectBtnText}>REJECT</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No drivers awaiting approval.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F4F6F8" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  name: { fontWeight: "700", fontSize: 15 },
  meta: { color: "#666", fontSize: 12, marginTop: 2, marginBottom: 10 },
  docsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  docBox: { flex: 1 },
  docLabel: { fontSize: 11, color: "#666", marginBottom: 4, textAlign: "center" },
  docImg: { width: "100%", height: 70, borderRadius: 6, backgroundColor: "#EEE" },
  docMissing: { alignItems: "center", justifyContent: "center" },
  docMissingText: { fontSize: 10, color: "#999" },
  input: { backgroundColor: "#F4F6F8", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#DDD", marginBottom: 10, fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 10 },
  approveBtn: { flex: 1, backgroundColor: "#1E8449", borderRadius: 8, padding: 12, alignItems: "center" },
  approveBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  rejectBtn: { flex: 1, backgroundColor: "#FBEAE7", borderRadius: 8, padding: 12, alignItems: "center" },
  rejectBtnText: { color: "#C0392B", fontWeight: "700", fontSize: 12 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
