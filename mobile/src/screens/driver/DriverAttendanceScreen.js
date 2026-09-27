import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";

const STATUS_COLORS = { PRESENT: "#1E8449", ABSENT: "#C0392B", HALF_DAY: "#D68910", LEAVE: "#2471A3" };

export default function DriverAttendanceScreen() {
  const [records, setRecords] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/attendance"); // server scopes this to the logged-in driver
      setRecords(data);
    } catch (err) {
      // empty state shown below
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 12 }}
      data={records}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.date}>{new Date(item.date).toLocaleDateString("en-IN")}</Text>
          <Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No attendance records yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F4F6F8" },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" },
  date: { fontWeight: "600" },
  status: { fontWeight: "700", fontSize: 12 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
