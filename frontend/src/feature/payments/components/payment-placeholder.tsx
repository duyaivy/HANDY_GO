export default function PaymentPlaceholder({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">Tính năng đang được chuẩn bị.</p>
    </section>
  );
}
