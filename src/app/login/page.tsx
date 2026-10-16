import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borde bg-white p-8 shadow-sm">
        <h1 className="sr-only">Iniciar sesión</h1>
        <Logo tamano="lg" />
        <p className="mb-6 mt-4 text-sm text-texto-suave">Ingresa con tu cuenta</p>
        <LoginForm />
      </div>
    </main>
  );
}
