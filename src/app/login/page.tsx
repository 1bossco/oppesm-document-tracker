import { LoginForm } from "@/components/LoginForm";
import { isAuthEnabled } from "@/lib/auth";
import { getStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const names = (await getStaff()).map((s) => s.name);
  return <LoginForm names={names} passwordRequired={isAuthEnabled()} />;
}
