import type { ReactNode } from 'react';

export interface ShellProps {
  rail: ReactNode | null;
  center: ReactNode;
}

export function Shell({ rail, center }: ShellProps) {
  return (
    <div className="kb-shell" data-no-rail={rail === null ? 'true' : undefined} data-no-inspector="true">
      {rail !== null ? <aside className="kb-zone-rail">{rail}</aside> : null}
      <main className="kb-zone-center">{center}</main>
    </div>
  );
}
