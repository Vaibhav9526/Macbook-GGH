import type { A11yProfile, AccessibilitySettings } from '../../../shared/types';
import { A11Y_TILE_LABELS } from '../../../shared/a11y-profiles';

interface DashboardHeaderProps {
  a11y: AccessibilitySettings;
  profiles: A11yProfile[];
}

/** Title plus a one-glance status: how many tools are on, and the active profile. */
export function DashboardHeader({ a11y, profiles }: DashboardHeaderProps) {
  const onIds = a11y.tileOrder.filter((id) => (a11y.tiles[id] as { enabled: boolean }).enabled);
  const profile = profiles.find((p) => p.id === a11y.profile);
  return (
    <header className="a11y-header">
      <h1 className="main-h1">
        Accessibility<em>.</em>
      </h1>
      <p className="a11y-status" title={onIds.map((id) => A11Y_TILE_LABELS[id]).join(', ')}>
        <span className="a11y-status-dot" data-on={onIds.length > 0} aria-hidden />
        <span>
          <strong>{onIds.length === 0 ? 'No tools on' : `${onIds.length} of ${a11y.tileOrder.length} tools on`}</strong>
          {' · '}Profile: {profile ? profile.name : 'Custom'}
        </span>
      </p>
    </header>
  );
}
