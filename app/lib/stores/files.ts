import { map, type MapStore } from 'nanostores';
import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { createScopedLogger } from '~/utils/logger';
import { getEncoding } from 'istextorbinary';
import { Buffer } from 'node:buffer';
import * as nodePath from 'node:path';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';

const logger = createScopedLogger('FilesStore');
const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

export type FileMap = Record<
  string,
  | {
      type: 'file' | 'folder';
      content?: string;
      isBinary?: boolean;
    }
  | undefined
>;

export type LockedFiles = Record<string, boolean>;

export interface IFilesStore {
  files: MapStore<FileMap>;
  filesCount: number;
  isFileLocked(filePath: string): boolean;
  toggleFileLock(filePath: string): void;
  getFile(filePath: string): Promise<string | undefined>;
  getFileModifications(): Record<string, boolean>;
  resetFileModifications(): void;
  saveFile(filePath: string, content: string): Promise<void>;
}

export class FilesStore implements IFilesStore {
  #webcontainer: Promise<WebContainer>;
  #files: MapStore<FileMap>;
  #lockedFiles: MapStore<LockedFiles>;
  #fileModifications: MapStore<Record<string, boolean>>;
  #size = 0;
  #modifiedFiles = new Map<string, string>();

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
    this.#files = map({});
    this.#lockedFiles = map({});
    this.#fileModifications = map({});

    if (import.meta.hot) {
      import.meta.hot.data.files = this.#files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
      import.meta.hot.data.lockedFiles = this.#lockedFiles;
    }

    this.#init();
  }

  get files(): MapStore<FileMap> {
    return this.#files;
  }

  get filesCount(): number {
    return this.#size;
  }

  async getFile(filePath: string): Promise<string | undefined> {
    const dirent = this.#files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent.content;
  }

  getFileModifications(): Record<string, boolean> {
    return Object.fromEntries(Array.from(this.#modifiedFiles.keys()).map((file) => [file, true]));
  }

  resetFileModifications(): void {
    this.#modifiedFiles.clear();
  }

  isFileLocked(filePath: string): boolean {
    return this.#lockedFiles.get()[filePath] || false;
  }

  toggleFileLock(filePath: string): void {
    const currentLocks = this.#lockedFiles.get();
    this.#lockedFiles.set({
      ...currentLocks,
      [filePath]: !currentLocks[filePath],
    });
  }

  async saveFile(filePath: string, content: string): Promise<void> {
    try {
      const webcontainer = await this.#webcontainer;
      const relativePath = nodePath.relative(webcontainer.workdir, filePath);
      const oldContent = await this.getFile(filePath);

      await webcontainer.fs.writeFile(relativePath, content);

      if (oldContent && !this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      this.#files.setKey(filePath, {
        type: 'file',
        content,
        isBinary: false,
      });

      logger.info('File updated');
    } catch (error) {
      logger.error('Failed to save file', error);
      throw error;
    }
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    webcontainer.internal.watchPaths(
      { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
      bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
    );
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path, buffer } of watchEvents) {
      const sanitizedPath = path.replace(/\/+$/g, '');

      switch (type) {
        case 'add_dir': {
          this.files.setKey(sanitizedPath, { type: 'folder' });
          break;
        }
        case 'remove_dir': {
          this.files.setKey(sanitizedPath, undefined);

          for (const [direntPath] of Object.entries(this.files.get())) {
            if (direntPath.startsWith(sanitizedPath)) {
              this.files.setKey(direntPath, undefined);
            }
          }

          break;
        }
        case 'add_file':
        case 'change': {
          if (type === 'add_file') {
            this.#size++;
          }

          let content = '';

          const isBinary = isBinaryFile(buffer);

          if (!isBinary) {
            content = this.#decodeFileContent(buffer);
          }

          this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });

          break;
        }
        case 'remove_file': {
          this.#size--;
          this.files.setKey(sanitizedPath, undefined);
          break;
        }
        case 'update_directory': {
          break;
        }
      }
    }
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      console.log(error);
      return '';
    }
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) {
    return false;
  }

  return getEncoding(convertToBuffer(buffer), { chunkLength: 100 }) === 'binary';
}

function convertToBuffer(view: Uint8Array): Buffer {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}
