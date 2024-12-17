import { memo, useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { useStore } from '@nanostores/react';
import type { FileMap } from '~/lib/stores/files';
import { classNames } from '~/utils/classNames';
import { renderLogger } from '~/utils/logger';
import { workbenchStore } from '~/lib/stores/workbench';

const NODE_PADDING_LEFT = 8;
const DEFAULT_HIDDEN_FILES = [/\/node_modules\//, /\/\.next/, /\/\.astro/];

interface Props {
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: string[];
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  className?: string;
}

export const FileTree = memo(
  ({
    onFileSelect,
    selectedFile,
    rootFolder,
    hideRoot = false,
    collapsed = [],
    allowFolderSelection = false,
    hiddenFiles,
    className,
    unsavedFiles,
  }: Props) => {
    renderLogger.trace('FileTree');

    const filesStore = useStore(workbenchStore.filesStore);

    const computedHiddenFiles = useMemo(() => [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])], [hiddenFiles]);

    const fileList = useMemo(() => {
      return buildFileList(filesStore.files, rootFolder, hideRoot, computedHiddenFiles);
    }, [filesStore.files, rootFolder, hideRoot, computedHiddenFiles]);

    const folders = useMemo(() => fileList.filter((item) => item.kind === 'folder'), [fileList]);

    // Initial collapsed folders based on props
    const initialCollapsedFolders = useMemo(() => {
      return collapsed && collapsed.length > 0
        ? new Set(
            fileList
              .filter((item) => item.kind === 'folder')
              .map((item) => item.fullPath)
              .filter((path) => collapsed.includes(path)),
          )
        : new Set<string>();
    }, [collapsed, fileList]);

    const [collapsedFolders, setCollapsedFolders] = useState(initialCollapsedFolders);

    // Helper to compare two sets for equality
    function setsAreEqual(a: Set<string>, b: Set<string>): boolean {
      if (a.size !== b.size) {
        return false;
      }

      for (const val of a) {
        if (!b.has(val)) {
          return false;
        }
      }

      return true;
    }

    useEffect(() => {
      const folderPaths = folders.map((item) => item.fullPath);

      // If we have a collapsed prop, enforce it
      if (collapsed && collapsed.length > 0) {
        const newCollapsed = new Set(folderPaths.filter((path) => collapsed.includes(path)));

        // Only update state if there's a real change
        if (!setsAreEqual(newCollapsed, collapsedFolders)) {
          setCollapsedFolders(newCollapsed);
        }

        return;
      }

      // Otherwise, keep only those previously collapsed folders that still exist
      setCollapsedFolders((prevCollapsed) => {
        const newCollapsed = new Set<string>();

        for (const folder of folders) {
          if (prevCollapsed.has(folder.fullPath)) {
            newCollapsed.add(folder.fullPath);
          }
        }

        // Check if new set differs from old set
        return setsAreEqual(newCollapsed, prevCollapsed) ? prevCollapsed : newCollapsed;
      });
    }, [collapsed, folders, collapsedFolders]); // Include collapsedFolders to correctly compare sets

    /*
     *   useEffect(() => {
     *   const fetchData = async () => {
     *    try {
     *      const data = await someAsyncOperation();
     *      // Handle data
     *    } catch (error) {
     *      logger.error('Failed to fetch data:', error);
     *      // Optionally send a response or update state to reflect the error
     *    }
     *   };
     *
     *   fetchData();
     *   }, []); // dependencies
     */

    const filteredFileList = useMemo(() => {
      const list = [];

      let lastDepth = Number.MAX_SAFE_INTEGER;

      for (const fileOrFolder of fileList) {
        const depth = fileOrFolder.depth;

        // if the depth is equal we reached the end of the collaped group
        if (lastDepth === depth) {
          lastDepth = Number.MAX_SAFE_INTEGER;
        }

        // ignore collapsed folders
        if (collapsedFolders.has(fileOrFolder.fullPath)) {
          lastDepth = Math.min(lastDepth, depth);
        }

        // ignore files and folders below the last collapsed folder
        if (lastDepth < depth) {
          continue;
        }

        list.push(fileOrFolder);
      }

      return list;
    }, [fileList, collapsedFolders]);

    const toggleCollapseState = (fullPath: string) => {
      setCollapsedFolders((prevSet) => {
        const newSet = new Set(prevSet);

        if (newSet.has(fullPath)) {
          newSet.delete(fullPath);
        } else {
          newSet.add(fullPath);
        }

        return newSet;
      });
    };

    return (
      <div className={classNames('text-sm', className, 'overflow-y-auto')}>
        {filteredFileList.map((fileOrFolder) => {
          switch (fileOrFolder.kind) {
            case 'file': {
              return (
                <File
                  key={fileOrFolder.id}
                  selected={selectedFile === fileOrFolder.fullPath}
                  path={fileOrFolder.fullPath}
                  name={fileOrFolder.name}
                  unsaved={unsavedFiles?.has(fileOrFolder.fullPath)}
                  onSelect={onFileSelect}
                />
              );
            }
            case 'folder': {
              return (
                <Folder
                  key={fileOrFolder.id}
                  folder={fileOrFolder}
                  selected={allowFolderSelection && selectedFile === fileOrFolder.fullPath}
                  collapsed={collapsedFolders.has(fileOrFolder.fullPath)}
                  onClick={() => {
                    toggleCollapseState(fileOrFolder.fullPath);
                  }}
                />
              );
            }
            default: {
              return undefined;
            }
          }
        })}
      </div>
    );
  },
);

interface FolderProps {
  folder: FolderNode;
  collapsed: boolean;
  selected?: boolean;
  onClick: () => void;
}

function Folder({ folder: { depth, name }, collapsed, selected = false, onClick }: FolderProps) {
  return (
    <NodeButton
      className={classNames('group', {
        'bg-transparent text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive hover:bg-bolt-elements-item-backgroundActive':
          !selected,
        'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': selected,
      })}
      depth={depth}
      iconClasses={classNames({
        'i-ph:caret-right scale-98': collapsed,
        'i-ph:caret-down scale-98': !collapsed,
      })}
      onClick={onClick}
    >
      {name}
    </NodeButton>
  );
}

interface FileProps {
  path: string;
  name: string;
  selected?: boolean;
  unsaved?: boolean;
  onSelect?: (path: string) => void;
}

function File({ path, name, selected, unsaved = false, onSelect }: FileProps) {
  const [showLock, setShowLock] = useState(false);
  const filesStore = useStore(workbenchStore.filesStore);

  const isLocked = filesStore?.isFileLocked?.(path) ?? false;

  const handleLockClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    filesStore?.toggleFileLock?.(path);
  };

  const handleFileClick = () => {
    if (!isLocked && onSelect) {
      onSelect(path);
    }
  };

  const buttonClasses = [
    'group relative',
    !selected && !isLocked
      ? 'bg-transparent hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentDefault'
      : '',
    isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    selected ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent' : '',
  ].filter(Boolean);

  return (
    <NodeButton
      className={classNames(...buttonClasses)}
      depth={path.split('/').length - 1} // Calculate proper depth from path
      onMouseEnter={() => setShowLock(true)}
      onMouseLeave={() => setShowLock(false)}
      iconClasses={classNames('i-ph:file-duotone scale-98', {
        'group-hover:text-bolt-elements-item-contentActive': !selected && !isLocked,
      })}
      onClick={handleFileClick}
    >
      <div
        className={classNames('flex items-center', {
          'group-hover:text-bolt-elements-item-contentActive': !selected,
        })}
      >
        <div className="flex-1 truncate pr-2">{name}</div>
        {unsaved && <span className="i-ph:circle-fill scale-68 shrink-0 text-orange-500" />}
        {(showLock || isLocked) && (
          <button
            className="i-ph:lock-simple-fill scale-75 shrink-0 hover:text-bolt-elements-item-contentActive"
            onClick={handleLockClick}
          />
        )}
      </div>
    </NodeButton>
  );
}

interface ButtonProps {
  depth: number;
  iconClasses: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function NodeButton({ depth, iconClasses, onClick, onMouseEnter, onMouseLeave, className, children }: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center gap-1.5 w-full pr-2 border-2 border-transparent text-faded py-0.5',
        className,
      )}
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
      onClick={() => onClick?.()}
      onMouseEnter={() => onMouseEnter?.()}
      onMouseLeave={() => onMouseLeave?.()}
    >
      <div className={classNames('scale-120 shrink-0', iconClasses)}></div>
      <div className="truncate w-full text-left">{children}</div>
    </button>
  );
}

type Node = FileNode | FolderNode;
interface BaseNode {
  id: number;
  depth: number;
  name: string;
  fullPath: string;
}
interface FileNode extends BaseNode {
  kind: 'file';
}
interface FolderNode extends BaseNode {
  kind: 'folder';
}

function isHiddenFile(filePath: string, fileName: string, hiddenFiles: Array<string | RegExp>): boolean {
  return hiddenFiles.some((pathOrRegex) => {
    if (typeof pathOrRegex === 'string') {
      return filePath.includes(pathOrRegex) || fileName.includes(pathOrRegex);
    } else {
      return pathOrRegex.test(filePath) || pathOrRegex.test(fileName);
    }
  });
}

function buildFileList(
  files: FileMap,
  rootFolder = '/',
  hideRoot: boolean,
  hiddenFiles: Array<string | RegExp>,
): Node[] {
  const folderPaths = new Set<string>();
  const fileList: Node[] = [];

  let defaultDepth = 0;

  if (rootFolder === '/' && !hideRoot) {
    defaultDepth = 1;
    fileList.push({ kind: 'folder', name: '/', depth: 0, id: 0, fullPath: '/' });
  }

  for (const [filePath, dirent] of Object.entries(files)) {
    // Ensure filePath is properly normalized
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const segments = normalizedPath.split('/').filter((segment) => segment);
    const fileName = segments.at(-1);

    if (!fileName || isHiddenFile(normalizedPath, fileName, hiddenFiles)) {
      continue;
    }

    let currentPath = '';
    let i = 0;
    let depth = 0;

    while (i < segments.length) {
      const name = segments[i];
      const fullPath = (currentPath += `/${name}`);

      if (!fullPath.startsWith(rootFolder) || (hideRoot && fullPath === rootFolder)) {
        i++;
        continue;
      }

      // Add proper depth calculation
      const nodeDepth = depth + (hideRoot ? 0 : defaultDepth);

      if (i === segments.length - 1 && dirent?.type === 'file') {
        fileList.push({
          kind: 'file',
          id: fileList.length,
          name,
          fullPath,
          depth: nodeDepth,
        });
      } else if (!folderPaths.has(fullPath)) {
        folderPaths.add(fullPath);
        fileList.push({
          kind: 'folder',
          id: fileList.length,
          name,
          fullPath,
          depth: nodeDepth,
        });
      }

      i++;
      depth++;
    }
  }

  return fileList.sort((a, b) => {
    // Sort folders before files
    if (a.kind !== b.kind) {
      return a.kind === 'folder' ? -1 : 1;
    }

    // Sort by name within same type
    return a.name.localeCompare(b.name);
  });
}

export default FileTree;
