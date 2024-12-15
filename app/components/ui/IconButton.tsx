import { memo, useRef, forwardRef } from 'react';
import { classNames } from '~/utils/classNames';

type IconSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface SafeRefWrapperProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const SafeRefWrapper = memo(
  forwardRef<HTMLButtonElement, SafeRefWrapperProps>(({ children, ...props }, forwardedRef) => {
    const localRef = useRef<HTMLButtonElement>(null);
    const ref = forwardedRef || localRef;

    return (
      <button {...props} ref={ref}>
        {children}
      </button>
    );
  }),
);

SafeRefWrapper.displayName = 'SafeRefWrapper';

interface BaseIconButtonProps {
  size?: IconSize;
  className?: string;
  iconClassName?: string;
  disabledClassName?: string;
  title?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

type IconButtonWithoutChildrenProps = {
  icon: string;
  children?: undefined;
} & BaseIconButtonProps;

type IconButtonWithChildrenProps = {
  icon?: undefined;
  children: string | JSX.Element | JSX.Element[];
} & BaseIconButtonProps;

type IconButtonProps = IconButtonWithoutChildrenProps | IconButtonWithChildrenProps;

export const IconButton = memo(
  forwardRef<HTMLButtonElement, IconButtonProps>(
    (
      { icon, size = 'xl', className, iconClassName, disabledClassName, disabled = false, title, onClick, children },
      ref,
    ) => {
      const handleClick = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        if (disabled) {
          return;
        }

        onClick?.(event);
      };

      return (
        <SafeRefWrapper
          ref={ref}
          className={classNames(
            'flex items-center text-bolt-elements-item-contentDefault bg-transparent enabled:hover:text-bolt-elements-item-contentActive rounded-md p-1 enabled:hover:bg-bolt-elements-item-backgroundActive disabled:cursor-not-allowed',
            {
              [classNames('opacity-30', disabledClassName)]: disabled,
            },
            className,
          )}
          title={title}
          disabled={disabled}
          onClick={handleClick}
        >
          {children ? children : <div className={classNames(icon, getIconSize(size), iconClassName)}></div>}
        </SafeRefWrapper>
      );
    },
  ),
);

IconButton.displayName = 'IconButton';

function getIconSize(size: IconSize) {
  if (size === 'sm') {
    return 'text-sm';
  } else if (size === 'md') {
    return 'text-md';
  } else if (size === 'lg') {
    return 'text-lg';
  } else if (size === 'xl') {
    return 'text-xl';
  } else {
    return 'text-2xl';
  }
}
