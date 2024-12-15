import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';

interface WebContainerContext {
  loaded: boolean;
  fs: any | null;  // Using any since we don't have the exact type from WebContainer
  ready: boolean;
}

export const webcontainerContext: WebContainerContext = {
  loaded: false,
  fs: null,
  ready: false,
};

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer = Promise.resolve()
    .then(async () => {
      const container = await WebContainer.boot({
        workdirName: WORK_DIR_NAME,
      });

      // Update context after successful boot
      webcontainerContext.loaded = true;
      webcontainerContext.fs = container.fs;
      webcontainerContext.ready = true;

      return container;
    })
    .catch((error) => {
      console.error('Failed to initialize webcontainer:', error);
      throw error;
    });
}
