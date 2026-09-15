// src/app/users/layout.tsx

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <h2>HandyGo users public</h2>
      {children}
    </main>
  );
}
