import { createContext, useMemo, type ReactNode } from 'react';

// project-imports
import config from '../config';

// types
import type { CustomizationProps, DefaultConfigProps } from '../types/config';

const noop = () => {};

// initial state
const initialState: CustomizationProps = {
  ...config,
  onChangeContainer: noop,
  onChangeLocalization: noop,
  onChangeMode: noop,
  onChangePresetColor: noop,
  onChangeDirection: noop,
  onChangeMiniDrawer: noop,
  onChangeMenuOrientation: noop,
  onChangeMenuCaption: noop,
  onChangeFontFamily: noop,
  onChangeContrast: noop,
};

// ==============================|| CONFIG CONTEXT & PROVIDER ||============================== //

const ConfigContext = createContext(initialState);

type ConfigProviderProps = {
  /** Overrides on top of the template defaults; the host app owns these (e.g. the theme mode). */
  value?: Partial<DefaultConfigProps>;
  children: ReactNode;
};

/**
 * Kodra keeps its own preferences (theme, rail) in its prefs store, so this
 * provider takes the config as props instead of persisting it to
 * localStorage like the template's original provider did.
 */
function ConfigProvider({ value, children }: ConfigProviderProps) {
  const merged = useMemo(() => ({ ...initialState, ...value }), [value]);
  return <ConfigContext.Provider value={merged}>{children}</ConfigContext.Provider>;
}

export { ConfigProvider, ConfigContext };
