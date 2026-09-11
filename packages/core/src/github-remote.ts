const GITHUB_OWNER_OR_REPO = /^[A-Za-z0-9._-]+$/;

/** Parse the supported github.com origin URL forms into repository coordinates. */
export function parseGitHubRemoteUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  const scpMatch = /^git@github\.com:(.*)$/.exec(trimmed);
  const urlMatch = /^(?:https?|ssh):\/\/(?:[^@/?#]+@)?github\.com\/(.*)$/.exec(trimmed);
  const path = scpMatch?.[1] ?? urlMatch?.[1];
  if (path === undefined) return null;

  let normalized = path;
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  if (normalized.endsWith('.git')) normalized = normalized.slice(0, -4);
  const parts = normalized.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (
    !owner ||
    !repo ||
    owner === '.' ||
    owner === '..' ||
    repo === '.' ||
    repo === '..' ||
    !GITHUB_OWNER_OR_REPO.test(owner) ||
    !GITHUB_OWNER_OR_REPO.test(repo)
  ) {
    return null;
  }
  return { owner, repo };
}
