import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Linking, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import client, { getToken } from "../../api/client";

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl || "").replace(/\/api\/?$/, "");

export default function PaymentHistoryScreen() {
  const [payments, setPayments] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/salary-payments");
      setPayments(data);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load payment history");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function downloadExcel() {
    const token = await getToken();
    Linking.openURL(`${API_BASE}/reports/export/salary?token=${token}`);
  }

  return (
    <FlatList
      style={styles.container}
      ListHeaderComponent={
        <TouchableOpacity style={styles.exportBtn} onPress={downloadExcel}>
          <Text style={styles.exportBtnText}>DOWNLOAD SALARY REPORT (EXCEL)</Text>
        </TouchableOpacity>
      }
      data={payments}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.driver.fullName} ({item.driver.employeeId})</Text>
          <Text style={styles.meta}>{item.salary.month}/{item.salary.year} · ₹{item.amount}</Text>
          <Text style={styles.meta}>UTR: {item.utr}</Text>
          <Text style={styles.meta}>{new Date(item.paymentDate).toLocaleDateString("en-IN")} · {item.status}</Text>
          {item.receipt && (
            <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE}${item.receipt.pdfUrl}`)}>
              <Text style={styles.link}>View Receipt ({item.receipt.receiptNumber})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No payments recorded yet.</Text>}
      contentContainerStyle={{ padding: 12 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F4F6F8" },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10 },
  name: { fontWeight: "700" },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  link: { color: "#0F3D5C", fontWeight: "600", marginTop: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
  exportBtn: { borderWidth: 1, borderColor: "#0F3D5C", borderRadius: 10, padding: 12, alignItems: "center", marginBottom: 12 },
  exportBtnText: { color: "#0F3D5C", fontWeight: "700", fontSize: 12 },
});
