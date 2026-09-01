import { useEffect, useState } from 'react';
import {
  getBridge,
  type RecentCloudWorkspace,
} from '../desktop-bridge.js';
import { Logo } from '../components/Logo.js';
import type { OrgSummary, ProjectSummary } from '@kanbots/cloud-client';

export interface CloudWorkspacePickerProps {
  initialRecents: RecentCloudWorkspace[];
  /** When set, lets the user fall back to the local-mode picker. */
  onPickLocal?: () => void;
  onOpened: () => void;
}

interface OrgWithProjects {
  org: OrgSummary;
  projects: ProjectSummary[];
}

/**
 * Free-floating cloud workspace picker. Lists the user's orgs +
 * projects so they can pick one to work in. Recently-opened cloud
 * workspaces float to the top.
 *
 * For users without any orgs yet we offer an inline "Create org"
 * affordance so they don't bounce out to the cloud web UI.
 */
export function CloudWorkspacePicker({
  initialRecents,
  onPickLocal,
  onOpened,
}: CloudWorkspacePickerProps) {
  const [recents] = useState<RecentCloudWorkspace[]>(initialRecents);
  const [orgs, setOrgs] = useState<OrgWithProjects[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgDisplayName, setOrgDisplayName] = useState('');
  const [creatingProjectFor, setCreatingProjectFor] = useState<string | null>(null);
  const [projectDisplayName, setProjectDisplayName] = useState('');

  async function loadOrgsAndProjects(): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setError('Desktop bridge not available.');
      return;
    }
    setError(null);
    try {
      const orgList = await bridge.cloudOrgsList({ limit: 50 });
      const withProjects = await Promise.all(
        orgList.data.map(async (o) => {
          const projects = await bridge.cloudProjectsList(o.slug);
          return { org: o, projects: projects.data };
        }),
      );
      setOrgs(withProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadOrgsAndProjects();
  }, []);

  async function open(orgSlug: string, projectSlug: string): Promise<void> {
    const bridge = getBridge();
    if (!bridge) return;
    setBusy(true);
    setError(null);
    const result = await bridge.openCloudWorkspace({ orgSlug, projectSlug });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    onOpened();
  }

  async function createOrg(): Promise<void> {
    const bridge = getBridge();
    if (!bridge || orgDisplayName.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await bridge.cloudOrgsCreate({ display_name: orgDisplayName.trim() });
      setOrgDisplayName('');
      setCreatingOrg(false);
      await loadOrgsAndProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createProject(orgSlug: string): Promise<void> {
    const bridge = getBridge();
    if (!bridge || projectDisplayName.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const project = await bridge.cloudProjectsCreate({
        orgSlug,
        body: { display_name: projectDisplayName.trim() },
      });
      setProjectDisplayName('');
      setCreatingProjectFor(null);
      await open(orgSlug, project.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="picker">
      <div className="picker-card" style={{ maxWidth: 640 }}>
        <h1 className="picker-title">
          <Logo size={28} withWordmark />
        </h1>
        <p className="picker-sub">
          Pick a Kanbots Cloud project to open. Tasks and runs are stored on the cloud
          and shared with your team.
        </p>

        {error !== null ? (
          <div role="alert" style={{ color: 'var(--failed)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        {recents.length > 0 ? (
          <section style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
              Recent
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
              {recents.map((r) => (
                <li key={`${r.orgSlug}/${r.projectSlug}`}>
                  <button
                    type="button"
                    className="picker-recent"
                    disabled={busy}
                    onClick={() => void open(r.orgSlug, r.projectSlug)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <strong>{r.projectDisplayName}</strong>{' '}
                    <span style={{ color: 'var(--ink-3)' }}>
                      · {r.orgDisplayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
            Your orgs
          </h2>
          {orgs === null ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
          ) : orgs.length === 0 ? (
            <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
              You don’t belong to any orgs yet. Create one to get started.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {orgs.map(({ org, projects }) => (
                <li
                  key={org.slug}
                  style={{
                    border: '1px solid var(--hairline-soft)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>{org.display_name}</strong>
                    <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{org.role}</span>
                  </header>
                  {projects.length === 0 ? (
                    <div style={{ color: 'var(--ink-3)', fontSize: 12, marginBottom: 8 }}>
                      No projects yet.
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0', display: 'grid', gap: 4 }}>
                      {projects.map((p) => (
                        <li key={p.slug}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void open(org.slug, p.slug)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '6px 8px',
                              border: '1px solid var(--hairline-soft)',
                              borderRadius: 6,
                              background: 'transparent',
                              color: 'var(--ink)',
                              cursor: 'pointer',
                            }}
                          >
                            {p.display_name}{' '}
                            <span style={{ color: 'var(--ink-3)' }}>· {p.slug}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {creatingProjectFor === org.slug ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={projectDisplayName}
                        onChange={(e) => setProjectDisplayName(e.target.value)}
                        placeholder="New project name"
                        autoFocus
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid var(--hairline-soft)',
                          borderRadius: 6,
                          background: 'transparent',
                          color: 'var(--ink)',
                          fontSize: 13,
                        }}
                      />
                      <button
                        type="button"
                        className="kb-btn primary"
                        disabled={busy || projectDisplayName.trim().length === 0}
                        onClick={() => void createProject(org.slug)}
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        className="kb-btn ghost"
                        onClick={() => {
                          setCreatingProjectFor(null);
                          setProjectDisplayName('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="kb-btn ghost"
                      onClick={() => {
                        setCreatingProjectFor(org.slug);
                        setProjectDisplayName('');
                      }}
                      style={{ fontSize: 12 }}
                    >
                      + New project
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{ marginTop: 16 }}>
          {creatingOrg ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={orgDisplayName}
                onChange={(e) => setOrgDisplayName(e.target.value)}
                placeholder="Org display name"
                autoFocus
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '1px solid var(--hairline-soft)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--ink)',
                }}
              />
              <button
                type="button"
                className="kb-btn primary"
                disabled={busy || orgDisplayName.trim().length === 0}
                onClick={() => void createOrg()}
              >
                Create org
              </button>
              <button
                type="button"
                className="kb-btn ghost"
                onClick={() => {
                  setCreatingOrg(false);
                  setOrgDisplayName('');
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="kb-btn ghost"
              onClick={() => setCreatingOrg(true)}
            >
              + New org
            </button>
          )}
        </section>

        {onPickLocal !== undefined ? (
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16 }}>
            Want to work locally instead?{' '}
            <button
              type="button"
              onClick={onPickLocal}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-2)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Open a folder
            </button>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
