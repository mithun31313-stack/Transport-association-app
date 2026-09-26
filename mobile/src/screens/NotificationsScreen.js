import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../api/client";

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/notifications");
      setNotifications(data);
    } catch (err) {
      // empty state below
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markRead(id) {
    try {
      await client.put(`/notifications/${id}/read`);
      load();
    } catch (err) {
      // non-critical — ignore
    }
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 12 }}
      data={notifications}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.card, !item.isRead && styles.cardUnread]}
          onPress={() => !item.isRead && markRead(item.id)}
        >
          <View style={styles.row}>
            {!item.isRead && <View style={styles.dot} />}
            <Text style={styles.title}>{item.title}</Text>
          </View>
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("en-IN")}</Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F4F6F8" },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  cardUnread: { backgroundColor: "#EAF2F8" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2471A3" },
  title: { fontWeight: "700", fontSize: 14 },
  message: { color: "#555", fontSize: 13, marginTop: 4, lineHeight: 18 },
  date: { color: "#999", fontSize: 11, marginTop: 6 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
