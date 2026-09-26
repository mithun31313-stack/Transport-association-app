import React, { useCallback, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";

const DOC_LABELS = { AADHAR: "Aadhar Card", PAN: "PAN Card", LICENCE: "Driving Licence" };

export default function DriverDetailScreen({ route, navigation }) {
  const { driverId } = route.params;
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get(`/drivers/${driverId}`);
      setDriver(data);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load driver");
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function openSalary() {
    try {
      const { data: record } = await client.post(`/salaries/ensure/${driverId}`, {});
      navigation.navigate("Salary", { screen: "EditSalary", params: { salary: record } });
    } catch (err) {
      Alert.alert("Error", err.error || "Could not open salary editor");
    }
  }

  if (loading || !driver) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        {driver.profilePhotoUrl ? (
          <Image source={{ uri: driver.profilePhotoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoInitial}>{driver.fullName?.[0] || "?"}</Text>
          </View>
        )}
        <Text style={styles.name}>{driver.fullName}</Text>
        <Text style={styles.employeeId}>ID: {driver.employeeId}</Text>
        <Text style={styles.statusLine}>
          {driver.approvalStatus} · {driver.status}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Details</Text>
      <View style={styles.card}>
        <Row label="Phone" value={driver.phone} />
        <Row label="Email" value={driver.email || "—"} />
        <Row label="Address" value={driver.address || "—"} />
        <Row label="Licence No." value={driver.licenceNumber || "—"} />
        <Row label="Emergency Contact" value={driver.emergencyContact || "—"} />
        <Row label="Joined" value={new Date(driver.joiningDate).toLocaleDateString("en-IN")} />
      </View>

      <Text style={styles.sectionTitle}>Bank Details</Text>
      <View style={styles.card}>
        {driver.bankAccount ? (
          <>
            <Row label="Bank" value={driver.bankAccount.bankName} />
            <Row label="Account" value={driver.bankAccount.maskedAccountNumber} />
            <Row label="IFSC" value={driver.bankAccount.ifsc} />
            <Row label="Verification" value={driver.bankAccount.verificationStatus} />
          </>
        ) : (
          <Text style={styles.empty}>No bank details submitted yet.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Documents</Text>
      <View style={styles.card}>
        <View style={styles.docsGrid}>
          {["AADHAR", "PAN", "LICENCE"].map((type) => {
            const doc = driver.documents?.find((d) => d.type === type);
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
      </View>

      <TouchableOpacity style={styles.salaryBtn} onPress={openSalary}>
        <Text style={styles.salaryBtnText}>SET / EDIT THIS MONTH'S SALARY</Text>
      </TouchableOpacity>
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
  container: { padding: 16, backgroundColor: "#F4F6F8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerCard: { backgroundColor: "#fff", borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 8 },
  photo: { width: 84, height: 84, borderRadius: 42, marginBottom: 10, backgroundColor: "#EEE" },
  photoPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#0F3D5C" },
  photoInitial: { color: "#fff", fontSize: 32, fontWeight: "700" },
  name: { fontSize: 18, fontWeight: "700", color: "#0F3D5C" },
  employeeId: { color: "#666", fontSize: 13, marginTop: 2 },
  statusLine: { color: "#999", fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#333", marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  rowLabel: { color: "#666" },
  rowValue: { fontWeight: "600" },
  empty: { color: "#999", fontSize: 13 },
  docsGrid: { flexDirection: "row", gap: 8 },
  docBox: { flex: 1 },
  docLabel: { fontSize: 11, color: "#666", marginBottom: 4, textAlign: "center" },
  docImg: { width: "100%", height: 80, borderRadius: 6, backgroundColor: "#EEE" },
  docMissing: { alignItems: "center", justifyContent: "center" },
  docMissingText: { fontSize: 10, color: "#999" },
  salaryBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 20, marginBottom: 40 },
  salaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
