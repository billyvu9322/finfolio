interface PagePlaceholderProps {
  title: string;
  description: string;
}

/** Generic "not built yet" screen used by feature routes during scaffolding. */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-400">{description}</p>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-700 p-10 text-center text-neutral-500">
        Chưa triển khai — màn hình này sẽ được xây dựng trong các sprint tới.
      </div>
    </div>
  );
}
