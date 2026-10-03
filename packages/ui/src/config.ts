// types
import type { DefaultConfigProps } from './types/config';

// ==============================|| THEME CONSTANT ||============================== //

export const twitterColor = '#1DA1F2';
export const facebookColor = '#3b5998';
export const linkedInColor = '#0e76a8';

export const APP_DEFAULT_PATH = '/sample-page';
export const HORIZONTAL_MAX_ITEM = 6;
export const DRAWER_WIDTH = 280;
export const MINI_DRAWER_WIDTH = 90;
export const HEADER_HEIGHT = 74;

export enum SimpleLayoutType {
  SIMPLE = 'simple',
  LANDING = 'landing',
}

export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  AUTO = 'auto',
}

export enum MenuOrientation {
  VERTICAL = 'vertical',
  HORIZONTAL = 'horizontal',
}

export enum ThemeDirection {
  LTR = 'ltr',
  RTL = 'rtl',
}

export enum NavActionType {
  FUNCTION = 'function',
  LINK = 'link',
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female',
}

export enum DropzopType {
  DEFAULT = 'default',
  STANDARD = 'standard',
}

// ==============================|| THEME CONFIG ||============================== //

const config: DefaultConfigProps = {
  fontFamily: `Inter var`,
  i18n: 'en',
  menuOrientation: MenuOrientation.VERTICAL,
  menuCaption: true,
  miniDrawer: false,
  container: false,
  mode: ThemeMode.LIGHT,
  presetColor: 'default',
  themeDirection: ThemeDirection.LTR,
  themeContrast: false,
};

export default config;
