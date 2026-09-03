import { LoginForm } from "./login-form";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Golf Meme Digest" };

export default function LoginPage() {
  return (
    <main className="gate">
      <Logo size={72} />
      <h1 className="gate__title">Golf Meme Digest</h1>
      <LoginForm />
    </main>
  );
}
