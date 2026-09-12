import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Appearance</h2>
        <AppearanceSettings initialAccentColor={user.accentColor} initialThemeMode={user.themeMode} />
      </div>
    </div>
  );
}
