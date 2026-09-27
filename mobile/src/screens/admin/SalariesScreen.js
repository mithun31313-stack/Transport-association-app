import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";

const STATUS_COLORS = {
  DRAFT: "#999",
  PENDING: "#D68910",
  APPROVED: "#2471A3",
  PAID: "#1E8449",
  FAILED: "#C0392B",
  CANCELLED: "#7B7D7D",
};

export default function SalariesScreen({ navigation }) {
  const [salaries, setSalaries] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/salaries");
      setSalaries(data);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load salaries");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function approve(id) {
    try {
      await client.post(`/salaries/${id}/approve`);
      load();
    } catch (err) {
      Alert.alert("Cannot approve", err.error || "Failed to approve");
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate("PaymentHistory")}>
        <Text style={styles.historyLinkText}>View Payment History →</Text>
      </TouchableOpacity>

      <FlatList
        data={salaries}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.driver.fullName} ({item.driver.employeeId})</Text>
              <Text style={styles.meta}>{item.month}/{item.year} · Net: ₹{item.netSalary}</Text>
              <Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
            </View>
            {(item.status === "DRAFT" || item.status === "PENDING") && (
              <View>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#0F3D5C", marginBottom: 6 }]}
                  onPress={() => navigation.navigate("EditSalary", { salary: item })}
                >
                  <Text style={styles.actionText}>EDIT AMOUNT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, Number(item.netSalary) <= 0 && styles.actionBtnDisabled]}
                  onPress={() => approve(item.id)}
                  disabled={Number(item.netSalary) <= 0}
                >
                  <Text style={styles.actionText}>APPROVE</Text>
                </TouchableOpacity>
              </View>
            )}
            {item.status === "APPROVED" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#0F3D5C" }]}
                onPress={() => navigation.navigate("PaySalary", { salaryId: item.id })}
              >
                <Text style={styles.actionText}>PAY SALARY</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No salary records yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8", padding: 12 },
  historyLink: { alignSelf: "flex-end", marginBottom: 8 },
  historyLinkText: { color: "#0F3D5C", fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center" },
  name: { fontWeight: "700", fontSize: 14 },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  actionBtn: { backgroundColor: "#1E8449", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  actionBtnDisabled: { backgroundColor: "#BBB" },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
