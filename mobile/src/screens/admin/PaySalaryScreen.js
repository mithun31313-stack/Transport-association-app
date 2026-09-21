import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, ScrollView } from "react-native";
import client from "../../api/client";

export default function PaySalaryScreen({ route, navigation }) {
  const { salaryId } = route.params;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.get(`/salary-payments/prepare/${salaryId}`);
        setInfo(data);
      } catch (err) {
        setError(err.error || "Could not load payment details");
      } finally {
        setLoading(false);
      }
    })();
  }, [salaryId]);

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;

  function openBankApp() {
    // No universal deep link works for every bank — this attempts a generic UPI/bank
    // app chooser and otherwise tells the admin to open their bank app manually.
    Linking.openURL("upi://pay").catch(() =>
      Alert.alert("Open manually", "Please open your bank's mobile app or net banking manually.")
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Manual Bank Transfer</Text>
      <Text style={styles.instructions}>{info.instructions}</Text>

      <View style={styles.card}>
        <Row label="Driver" value={`${info.driver.name} (${info.driver.employeeId})`} />
        <Row label="Salary Month" value={`${info.salary.month}/${info.salary.year}`} />
        <Row label="Net Salary" value={`₹${info.salary.netSalary}`} bold />
        <Row label="Bank" value={info.bank.bankName} />
        <Row label="Account" value={info.bank.maskedAccountNumber} />
        <Row label="IFSC" value={info.bank.ifsc} />
        <Row label="Verification" value={info.bank.verificationStatus} />
      </View>

      <Text style={styles.note}>
        Transfer the money using your bank's own app or net banking. This app does not move money — it only
        records the transfer once you confirm it with the transaction reference (UTR).
      </Text>

      <TouchableOpacity style={styles.secondaryBtn} onPress={openBankApp}>
        <Text style={styles.secondaryBtnText}>OPEN BANK APP</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate("ConfirmPayment", { salaryId, prepared: info })}
      >
        <Text style={styles.primaryBtnText}>CONTINUE</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelBtnText}>CANCEL</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, bold }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F4F6F8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#C0392B", textAlign: "center", padding: 20 },
  heading: { fontSize: 20, fontWeight: "700", color: "#0F3D5C", marginBottom: 6 },
  instructions: { color: "#555", marginBottom: 16, lineHeight: 20 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  rowLabel: { color: "#666" },
  rowValue: { fontWeight: "600" },
  rowValueBold: { fontSize: 16, color: "#0F3D5C" },
  note: { fontSize: 12, color: "#888", marginBottom: 20, lineHeight: 18 },
  primaryBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 10 },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 10 },
  secondaryBtnText: { color: "#0F3D5C", fontWeight: "700" },
  cancelBtn: { padding: 10, alignItems: "center" },
  cancelBtnText: { color: "#C0392B", fontWeight: "600" },
});
