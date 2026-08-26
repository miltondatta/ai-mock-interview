export default function BackgroundDecoration() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/25 blur-[130px]" />
      <div className="absolute top-[35%] -left-40 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[110px]" />
      <div className="absolute bottom-[-10%] -right-40 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[110px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[length:28px_28px] opacity-40" />
    </div>
  );
}
