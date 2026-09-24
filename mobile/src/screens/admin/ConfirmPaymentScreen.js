import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import client from "../../api/client";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ConfirmPaymentScreen({ route, navigation }) {
  const { salaryId, prepared } = route.params;
  const [utr, setUtr] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (!utr.trim()) {
      Alert.alert("UTR required", "Enter the UTR / transaction reference from your bank transfer.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await client.post("/salary-payments/manual", {
        salaryId,
        utr: utr.trim(),
        paymentDate,
        remarks: remarks.trim() || undefined,
      });
      Alert.alert("Payment recorded successfully.", `Receipt ${data.receipt.receiptNumber} generated.`, [
        { text: "OK", onPress: () => navigation.navigate("SalariesList") },
      ]);
    } catch (err) {
      // Server rejects duplicate payments, unapproved salaries, unverified bank accounts, etc.
      Alert.alert("Unable to confirm payment", err.error || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Did you complete the bank transfer?</Text>
      <Text style={styles.subtitle}>
        {prepared.driver.name} · ₹{prepared.salary.netSalary} · {prepared.salary.month}/{prepared.salary.year}
      </Text>

      <Text style={styles.label}>UTR / Transaction Reference *</Text>
      <TextInput style={styles.input} placeholder="e.g. SBIN123456789" value={utr} onChangeText={setUtr} autoCapitalize="characters" />

      <Text style={styles.label}>Payment Date *</Text>
      <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={paymentDate} onChangeText={setPaymentDate} />

      <Text style={styles.label}>Remarks</Text>
      <TextInput style={styles.input} placeholder="Optional" value={remarks} onChangeText={setRemarks} />

      <TouchableOpacity style={styles.primaryBtn} onPress={confirm} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>TRANSFER COMPLETED</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={submitting}>
        <Text style={styles.cancelBtnText}>CANCEL</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F4F6F8" },
  heading: { fontSize: 18, fontWeight: "700", color: "#0F3D5C", marginBottom: 4 },
  subtitle: { color: "#666", marginBottom: 20 },
  label: { fontSize: 13, color: "#444", marginBottom: 6, marginTop: 10, fontWeight: "600" },
  input: { backgroundColor: "#fff", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#DDD" },
  primaryBtn: { backgroundColor: "#1E8449", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 24 },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { padding: 12, alignItems: "center" },
  cancelBtnText: { color: "#C0392B", fontWeight: "600" },
});
