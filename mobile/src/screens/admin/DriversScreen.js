import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";

export default function DriversScreen() {
  const [drivers, setDrivers] = useState([]);
  const [q, setQ] = useState("");

  const load = useCallback(async (query = "") => {
    try {
      const { data } = await client.get("/drivers", { params: { q: query || undefined } });
      setDrivers(data);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load drivers");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(q);
    }, [load])
  );

  async function verifyBank(driverId, decision) {
    try {
      await client.post(`/drivers/${driverId}/bank/verify`, { decision });
      Alert.alert("Done", `Bank account ${decision.toLowerCase()}.`);
      load(q);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not update verification");
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search by name, employee ID, phone"
        value={q}
        onChangeText={(t) => {
          setQ(t);
          load(t);
        }}
      />
      <FlatList
        data={drivers}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.fullName}</Text>
              <Text style={styles.meta}>{item.employeeId} · {item.phone}</Text>
              <Text style={styles.meta}>
                Bank: {item.bankAccount ? item.bankAccount.verificationStatus : "NOT SUBMITTED"}
              </Text>
            </View>
            {item.bankAccount?.verificationStatus === "PENDING" && (
              <View>
                <TouchableOpacity style={styles.verifyBtn} onPress={() => verifyBank(item.id, "VERIFIED")}>
                  <Text style={styles.verifyText}>Verify</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => verifyBank(item.id, "REJECTED")}>
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No drivers found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8", padding: 12 },
  search: { backgroundColor: "#fff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#DDD", marginBottom: 10 },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center" },
  name: { fontWeight: "700", fontSize: 15 },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  verifyBtn: { backgroundColor: "#1E8449", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  verifyText: { color: "#fff", fontWeight: "600", fontSize: 12, textAlign: "center" },
  rejectText: { color: "#C0392B", fontSize: 12, textAlign: "center" },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
