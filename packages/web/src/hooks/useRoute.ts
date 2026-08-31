import { useEffect, useState } from 'react';
import { isValidCustomIssueId, parseIssueRef, type IssueRef } from '@kanbots/core';

export type Route = { name: 'board' } | { name: 'issue'; number: IssueRef };

function parseHash(): Route {
  const hash = window.location.hash.slice(1);
  const match = /^\/issue\/([A-Za-z0-9][A-Za-z0-9._-]{0,31})$/.exec(hash);
  if (match?.[1] && isValidCustomIssueId(match[1])) {
    return { name: 'issue', number: parseIssueRef(match[1]) };
  }
  return { name: 'board' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onHashChange = (): void => {
      setRoute(parseHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return route;
}

export function navigate(route: Route): void {
  if (route.name === 'board') {
    window.location.hash = '/';
  } else {
    window.location.hash = `/issue/${route.number}`;
  }
}

export function hrefFor(route: Route): string {
  if (route.name === 'board') return '#/';
  return `#/issue/${route.number}`;
}
