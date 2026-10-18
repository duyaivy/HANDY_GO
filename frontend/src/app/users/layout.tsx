// src/app/users/layout.tsx

export default function managerLayout({
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
