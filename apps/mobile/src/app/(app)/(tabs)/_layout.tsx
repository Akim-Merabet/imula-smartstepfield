import { Tabs } from "expo-router";

import { Icon, type IconName } from "@/components/kit";
import { OnlineToggle } from "@/components/online-toggle";
import { t } from "@/i18n/fr";
import { colors } from "@/theme";

function icon(name: IconName) {
  return function TabIcon({ color }: { color: unknown }) {
    return <Icon name={name} color={typeof color === "string" ? color : undefined} />;
  };
}

/** Coque de l'app (spec 05 §2.1) : Projets, Exécution, Accès rapide, Paramètres ; bascule En ligne / Hors ligne en en-tête. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: "700" },
        headerRight: () => <OnlineToggle />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("layout.projects"), tabBarIcon: icon("folder-multiple-outline") }} />
      <Tabs.Screen name="execution" options={{ title: t("layout.execution"), tabBarIcon: icon("play-circle-outline") }} />
      <Tabs.Screen name="quick-access" options={{ title: t("layout.quickAccess"), tabBarIcon: icon("lightning-bolt-outline") }} />
      <Tabs.Screen name="settings" options={{ title: t("layout.settings"), tabBarIcon: icon("cog-outline") }} />
    </Tabs>
  );
}
