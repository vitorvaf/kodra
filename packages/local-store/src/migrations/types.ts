export interface Migration {
  id: string;
  up: string;
  disableForeignKeys?: boolean;
}
