export function Section({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">{title}</h2>
          {subtitle ? <p className="section__sub">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="section__body">{children}</div>
    </section>
  );
}
