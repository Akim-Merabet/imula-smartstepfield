import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { DeviceSecurityGate } from "@/components/device-security-gate";
import { SessionProvider, useSession } from "@/session/session-context";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "starting") SplashScreen.hideAsync();
  }, [status]);

  if (status === "starting") return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === "ready"}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <DeviceSecurityGate>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SessionProvider>
    </DeviceSecurityGate>
  );
}
