import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../api/AuthContext";

import LoginScreen from "../screens/LoginScreen";
import DriverSignupScreen from "../screens/DriverSignupScreen";

import AdminDashboardScreen from "../screens/admin/DashboardScreen";
import AdminDriversScreen from "../screens/admin/DriversScreen";
import AdminPendingDriversScreen from "../screens/admin/PendingDriversScreen";
import AdminFinanceScreen from "../screens/admin/FinanceScreen";
import AdminSalariesScreen from "../screens/admin/SalariesScreen";
import PaySalaryScreen from "../screens/admin/PaySalaryScreen";
import ConfirmPaymentScreen from "../screens/admin/ConfirmPaymentScreen";
import PaymentHistoryScreen from "../screens/admin/PaymentHistoryScreen";

import DriverHomeScreen from "../screens/driver/DriverHomeScreen";
import DriverSalaryHistoryScreen from "../screens/driver/DriverSalaryHistoryScreen";
import DriverAttendanceScreen from "../screens/driver/DriverAttendanceScreen";
import DriverDocumentsScreen from "../screens/driver/DriverDocumentsScreen";
import DriverProfileScreen from "../screens/driver/DriverProfileScreen";

const RootStack = createNativeStackNavigator();
const AdminTabs = createBottomTabNavigator();
const DriverTabs = createBottomTabNavigator();
const AdminSalaryStack = createNativeStackNavigator();
const AdminDriversStack = createNativeStackNavigator();

function AdminDriversStackNavigator() {
  return (
    <AdminDriversStack.Navigator>
      <AdminDriversStack.Screen name="DriversList" component={AdminDriversScreen} options={{ title: "Drivers" }} />
      <AdminDriversStack.Screen name="PendingApprovals" component={AdminPendingDriversScreen} options={{ title: "Pending Approval" }} />
    </AdminDriversStack.Navigator>
  );
}

function AdminSalaryStackNavigator() {
  return (
    <AdminSalaryStack.Navigator>
      <AdminSalaryStack.Screen name="SalariesList" component={AdminSalariesScreen} options={{ title: "Salary" }} />
      <AdminSalaryStack.Screen name="PaySalary" component={PaySalaryScreen} options={{ title: "Pay Salary" }} />
      <AdminSalaryStack.Screen name="ConfirmPayment" component={ConfirmPaymentScreen} options={{ title: "Confirm Payment" }} />
      <AdminSalaryStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} options={{ title: "Payment History" }} />
    </AdminSalaryStack.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminTabs.Navigator screenOptions={{ headerShown: false }}>
      <AdminTabs.Screen name="Dashboard" component={AdminDashboardScreen} />
      <AdminTabs.Screen name="Drivers" component={AdminDriversStackNavigator} />
      <AdminTabs.Screen name="Finance" component={AdminFinanceScreen} options={{ headerShown: true, title: "Income / Expenses" }} />
      <AdminTabs.Screen name="Salary" component={AdminSalaryStackNavigator} />
    </AdminTabs.Navigator>
  );
}

function DriverNavigator() {
  return (
    <DriverTabs.Navigator>
      <DriverTabs.Screen name="Home" component={DriverHomeScreen} />
      <DriverTabs.Screen name="Salary" component={DriverSalaryHistoryScreen} />
      <DriverTabs.Screen name="Attendance" component={DriverAttendanceScreen} />
      <DriverTabs.Screen name="Documents" component={DriverDocumentsScreen} />
      <DriverTabs.Screen name="Profile" component={DriverProfileScreen} />
    </DriverTabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return null; // could render a splash/loading screen here

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <RootStack.Screen name="Login" component={LoginScreen} />
            <RootStack.Screen name="DriverSignup" component={DriverSignupScreen} options={{ headerShown: true, title: "Create Account" }} />
          </>
        ) : user.role === "ADMIN" ? (
          <RootStack.Screen name="AdminRoot" component={AdminNavigator} />
        ) : (
          <RootStack.Screen name="DriverRoot" component={DriverNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
