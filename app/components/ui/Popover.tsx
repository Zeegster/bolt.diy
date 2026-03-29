import * as Popover from '@radix-ui/react-popover';
import type { PropsWithChildren, ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

export default ({
  children,
  trigger,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  alignOffset = 0,
  collisionPadding = 8,
  contentClassName,
  showArrow = true,
}: PropsWithChildren<{
  trigger: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'center' | 'start' | 'end';
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  contentClassName?: string;
  showArrow?: boolean;
}>) => (
  <Popover.Root>
    <Popover.Trigger asChild>{trigger}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        side={side}
        align={align}
        className={classNames(
          'bg-bolt-elements-background-depth-2 text-bolt-elements-item-contentAccent p-2 rounded-md shadow-xl z-workbench',
          contentClassName,
        )}
      >
        {children}
        {showArrow ? <Popover.Arrow className="bg-bolt-elements-item-background-depth-2" /> : null}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);
