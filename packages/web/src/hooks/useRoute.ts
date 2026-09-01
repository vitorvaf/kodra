import { useEffect, useState } from 'react';

export type Route = { name: 'board' } | { name: 'issue'; number: number };

function parseHash(): Route {
  const hash = window.location.hash.slice(1);
  const match = /^\/issue\/(\d+)$/.exec(hash);
  if (match?.[1]) {
    return { name: 'issue', number: parseInt(match[1], 10) };
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
