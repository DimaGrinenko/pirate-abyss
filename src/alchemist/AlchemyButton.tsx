import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { assetUrl } from './assets';
import './button-art.css';

const ASSET_BASE = assetUrl('alchemist/ui/v4/button-');

export type AlchemyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'buy' | 'secondary';
};

/** A native, keyboard-accessible button assembled from physical raster layers. */
export const AlchemyButton = forwardRef<HTMLButtonElement, AlchemyButtonProps>(function AlchemyButton(
  { variant = 'primary', className = '', type = 'button', children, ...props }, ref,
) {
  const base = `${ASSET_BASE}${variant}`;
  return <button {...props} ref={ref} type={type} className={`alchemy-button alchemy-button--${variant} ${className}`}
    data-alchemy-button={variant}>
    <span className="alchemy-button__visual">
    <span className="alchemy-button__art" aria-hidden="true">
      <img className="alchemy-button__base" src={`${base}-base.webp`} alt="" draggable={false} />
      <img className="alchemy-button__pressed" src={`${base}-pressed.webp`} alt="" draggable={false} />
      <img className="alchemy-button__glow" src={`${base}-glow.webp`} alt="" draggable={false} />
      <img className="alchemy-button__seal" src={`${base}-seal.webp`} alt="" draggable={false} />
    </span>
    <span className="alchemy-button__label">{children}</span>
    </span>
  </button>;
});

export default AlchemyButton;
