import WithTooltip from '~/components/ui/Tooltip';
import { IconButton } from '~/components/ui/IconButton';
import React from 'react';

export const ExportChatButton = React.memo(({ exportChat }: { exportChat?: () => void }) => {
  const handleExport = React.useCallback(() => {
    exportChat?.();
  }, [exportChat]);

  return (
    <WithTooltip tooltip="Export Chat">
      <IconButton title="Export Chat" onClick={handleExport} className="hover:text-primary">
        <div className="i-ph:download-simple text-xl"></div>
      </IconButton>
    </WithTooltip>
  );
});

ExportChatButton.displayName = 'ExportChatButton';
