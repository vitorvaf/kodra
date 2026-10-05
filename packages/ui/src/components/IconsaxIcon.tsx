import type { Icon, IconProps } from 'iconsax-react';

export interface IconsaxIconProps extends IconProps {
  icon: Icon;
}

/**
 * Renders an iconsax-react icon with its defaults passed explicitly.
 * iconsax-react 0.0.8 declares `color`, `variant` and `size` through
 * `defaultProps`, which React 19 ignores on function components — without
 * them the paths get no fill and the icon renders invisible.
 */
export default function IconsaxIcon({
  icon: IconComponent,
  color = 'currentColor',
  variant = 'Linear',
  size = 24,
  ...rest
}: IconsaxIconProps) {
  return <IconComponent color={color} variant={variant} size={size} {...rest} />;
}
