import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">ERP Condominios</h1>
        <p className="mb-6 mt-1 text-sm text-gray-600">Ingresa con tu cuenta</p>
        <LoginForm />
      </div>
    </main>
  );
}
