import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Linking, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import client from "../../api/client";

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl || "").replace(/\/api\/?$/, "");

export default function DriverSalaryHistoryScreen() {
  const [salaries, setSalaries] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/salaries"); // server scopes this to the logged-in driver
      setSalaries(data);
    } catch (err) {
      // empty state shown below
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function viewReceipt(salaryId) {
    try {
      const { data: salary } = await client.get(`/salaries/${salaryId}`);
      const receiptUrl = salary.payments?.[0]?.receipt?.pdfUrl;
      if (!receiptUrl) return Alert.alert("Receipt not available", "This salary has not been paid yet.");
      Linking.openURL(`${API_BASE}${receiptUrl}`);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not open receipt");
    }
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 12 }}
      data={salaries}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.month}>{item.month}/{item.year}</Text>
            <Text style={styles.amount}>₹{item.netSalary}</Text>
            <Text style={[styles.status, { color: item.status === "PAID" ? "#1E8449" : "#D68910" }]}>{item.status}</Text>
          </View>
          {item.status === "PAID" && (
            <TouchableOpacity onPress={() => viewReceipt(item.id)}>
              <Text style={styles.link}>View Receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No salary records yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F4F6F8" },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  month: { fontWeight: "700" },
  amount: { fontWeight: "700", color: "#0F3D5C" },
  status: { fontSize: 12, fontWeight: "700" },
  link: { color: "#0F3D5C", fontWeight: "600" },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
