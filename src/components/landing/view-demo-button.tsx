import { viewDemoAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export function ViewDemoButton() {
  return (
    <form action={viewDemoAction}>
      <Button type="submit" size="lg">
        View Demo
      </Button>
    </form>
  );
}
