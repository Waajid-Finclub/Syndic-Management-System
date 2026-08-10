export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page__header">
      <div>
        <h1 className="page__title">{title}</h1>
        {subtitle ? <div className="page__subtitle">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}
