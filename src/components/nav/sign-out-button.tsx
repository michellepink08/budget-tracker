import { LogOut } from "lucide-react";
import { signOutAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

// When the sidebar is collapsed to icon-only width, showing the full
// "Sign out" label would overflow the narrow rail — this renders an
// icon-only button with an accessible name and a native tooltip instead,
// matching the pattern the collapse-toggle button already uses.
export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          className="mx-auto"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" className="w-full justify-start gap-2">
        <LogOut className="h-4 w-4 shrink-0" />
        Sign out
      </Button>
    </form>
  );
}
