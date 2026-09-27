import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import client from "../../api/client";

const FIELDS = [
  { key: "basicSalary", label: "Basic Salary", sign: "+" },
  { key: "allowance", label: "Allowance", sign: "+" },
  { key: "bonus", label: "Bonus", sign: "+" },
  { key: "otherPayment", label: "Other Payment", sign: "+" },
  { key: "advance", label: "Advance", sign: "−" },
  { key: "deduction", label: "Deduction", sign: "−" },
];

export default function EditSalaryScreen({ route, navigation }) {
  const { salary } = route.params; // the existing salary record
  const [values, setValues] = useState({
    basicSalary: String(salary.basicSalary ?? 0),
    allowance: String(salary.allowance ?? 0),
    bonus: String(salary.bonus ?? 0),
    otherPayment: String(salary.otherPayment ?? 0),
    advance: String(salary.advance ?? 0),
    deduction: String(salary.deduction ?? 0),
  });
  const [saving, setSaving] = useState(false);

  function num(key) {
    return parseFloat(values[key]) || 0;
  }

  const netPreview =
    num("basicSalary") + num("allowance") + num("bonus") + num("otherPayment") - num("advance") - num("deduction");

  async function save() {
    if (num("basicSalary") <= 0) {
      Alert.alert("Enter basic salary", "Basic salary must be greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await client.put(`/salaries/${salary.id}`, {
        basicSalary: num("basicSalary"),
        allowance: num("allowance"),
        bonus: num("bonus"),
        otherPayment: num("otherPayment"),
        advance: num("advance"),
        deduction: num("deduction"),
      });
      Alert.alert("Saved", "Salary amounts updated. You can now approve it.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Couldn't save", err.error || "Try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        {salary.driver?.fullName} — {salary.month}/{salary.year}
      </Text>
      {salary.requestedByDriver && (
        <Text style={styles.requestedNote}>Driver requested this salary — fill in the amounts below.</Text>
      )}

      {FIELDS.map(({ key, label, sign }) => (
        <View key={key}>
          <Text style={styles.label}>
            {label} ({sign})
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={values[key]}
            onChangeText={(t) => setValues({ ...values, [key]: t })}
            placeholder="0"
          />
        </View>
      ))}

      <View style={styles.netBox}>
        <Text style={styles.netLabel}>Net Salary (preview)</Text>
        <Text style={styles.netValue}>₹{netPreview.toLocaleString("en-IN")}</Text>
        <Text style={styles.netHint}>Calculated on the server too — this is just a preview.</Text>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>SAVE AMOUNTS</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F4F6F8" },
  title: { fontSize: 17, fontWeight: "700", color: "#0F3D5C", marginBottom: 4 },
  requestedNote: { color: "#B9770E", fontSize: 12, marginBottom: 16 },
  label: { fontSize: 12, color: "#666", marginTop: 14, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: "#fff", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#DDD" },
  netBox: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 24, alignItems: "center" },
  netLabel: { fontSize: 12, color: "#666" },
  netValue: { fontSize: 24, fontWeight: "700", color: "#0F3D5C", marginVertical: 4 },
  netHint: { fontSize: 11, color: "#999" },
  saveBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 20, marginBottom: 40 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
