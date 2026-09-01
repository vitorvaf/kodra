export class KanbotsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KanbotsError';
  }
}

export class KanbotsAuthError extends KanbotsError {
  constructor(message: string) {
    super(message);
    this.name = 'KanbotsAuthError';
  }
}

export class GitHubRequestError extends KanbotsError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'GitHubRequestError';
  }
}
