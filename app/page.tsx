import PinLoginForm from "@/components/auth/PinLoginForm";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_10%_0%,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(16,185,129,0.14),transparent_28%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-4 py-10">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-2xl shadow-slate-300/70 backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
        <section className="enterprise-dark-panel hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black uppercase text-emerald-300">
              Enterprise Operations OS
            </div>
            <h1 className="mt-8 max-w-xl text-5xl font-black leading-tight tracking-tight">
              Secure office access for Ddumba Property Operations.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-300">
              Office-scoped login, RLS-backed data isolation, audit trails, and live reporting for property operations teams.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Mini label="Security" value="RLS" />
            <Mini label="Audit" value="Live" />
            <Mini label="Reports" value="Realtime" />
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col items-center mb-8">
            <img
              src="/ddumba-logo.png"
              alt="Ddumba Logo"
              className="h-36 object-contain"
            />

            <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-400">
              Property Operations OS
            </p>
          </div>

          <h2 className="mb-2 text-center text-3xl font-black text-slate-950">
            Login
          </h2>

          <p className="mb-6 text-center text-sm font-semibold text-slate-500">
            Enter your PIN or password.
          </p>

          <PinLoginForm />

          <div className="mt-8 border-t border-slate-200 pt-4 text-center text-sm font-semibold text-slate-400">
            © 2026 Ddumba Property Management
          </div>

        </section>
      </div>
    </main >
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/10 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}
