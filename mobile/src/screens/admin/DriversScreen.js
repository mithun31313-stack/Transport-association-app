import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";
import { confirmAction } from "../../utils/confirm";

export default function DriversScreen({ navigation }) {
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

  async function toggleActive(driver) {
    const path = driver.status === "ACTIVE" ? "deactivate" : "reactivate";
    try {
      await client.post(`/drivers/${driver.id}/${path}`);
      load(q);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not update driver");
    }
  }

  function confirmDelete(driver) {
    confirmAction(
      "Remove driver?",
      `${driver.fullName} — this only works if they have no salary/payment history yet. Otherwise, deactivate them instead to keep records intact.`,
      async () => {
        try {
          await client.delete(`/drivers/${driver.id}`);
          load(q);
        } catch (err) {
          Alert.alert("Can't delete", err.error || "Try deactivating instead");
        }
      }
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.pendingLink} onPress={() => navigation.navigate("PendingApprovals")}>
        <Text style={styles.pendingLinkText}>Review Pending Approvals →</Text>
      </TouchableOpacity>
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
            <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate("DriverDetail", { driverId: item.id })}>
              <Text style={styles.name}>{item.fullName}</Text>
              <Text style={styles.meta}>{item.employeeId} · {item.phone}</Text>
              <Text style={styles.meta}>Status: {item.approvalStatus} · {item.status}</Text>
              <Text style={styles.meta}>
                Bank: {item.bankAccount ? item.bankAccount.verificationStatus : "NOT SUBMITTED"}
              </Text>
            </TouchableOpacity>
            <View>
              {item.bankAccount?.verificationStatus === "PENDING" && (
                <>
                  <TouchableOpacity style={styles.verifyBtn} onPress={() => verifyBank(item.id, "VERIFIED")}>
                    <Text style={styles.verifyText}>Verify Bank</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => verifyBank(item.id, "REJECTED")}>
                    <Text style={styles.rejectText}>Reject Bank</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.toggleBtn} onPress={() => toggleActive(item)}>
                <Text style={styles.toggleText}>{item.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(item)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No drivers found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8", padding: 12 },
  pendingLink: { alignSelf: "flex-end", marginBottom: 8 },
  pendingLinkText: { color: "#0F3D5C", fontWeight: "600" },
  search: { backgroundColor: "#fff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#DDD", marginBottom: 10 },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center" },
  name: { fontWeight: "700", fontSize: 15 },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  verifyBtn: { backgroundColor: "#1E8449", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  verifyText: { color: "#fff", fontWeight: "600", fontSize: 12, textAlign: "center" },
  rejectText: { color: "#C0392B", fontSize: 12, textAlign: "center", marginBottom: 6 },
  toggleBtn: { backgroundColor: "#F4F6F8", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  toggleText: { fontSize: 12, fontWeight: "600", color: "#666", textAlign: "center" },
  deleteText: { color: "#C0392B", fontSize: 12, textAlign: "center", fontWeight: "600" },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
