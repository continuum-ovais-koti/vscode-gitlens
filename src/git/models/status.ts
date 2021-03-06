'use strict';
import * as path from 'path';
import { Uri } from 'vscode';
import { GlyphChars } from '../../constants';
import { Strings } from '../../system';
import { GitUri } from '../gitUri';
import { GitBranch } from './branch';
import { GitLogCommit } from './logCommit';

export interface GitStatusUpstreamState {
    ahead: number;
    behind: number;
}

export class GitStatus {
    readonly detached: boolean;

    constructor(
        public readonly repoPath: string,
        public readonly branch: string,
        public readonly sha: string,
        public readonly files: GitStatusFile[],
        public readonly state: GitStatusUpstreamState,
        public readonly upstream?: string
    ) {
        this.detached = GitBranch.isDetached(branch);
        if (this.detached) {
            this.branch = GitBranch.formatDetached(this.sha);
        }
    }

    get ref() {
        return this.detached ? this.sha : this.branch;
    }

    private _diff?: {
        added: number;
        deleted: number;
        changed: number;
    };

    getDiffStatus(options: { empty?: string; expand?: boolean; prefix?: string; separator?: string } = {}): string {
        options = { empty: '', prefix: '', separator: ' ', ...options };
        if (this.files.length === 0) return options.empty!;

        if (this._diff === undefined) {
            this._diff = {
                added: 0,
                deleted: 0,
                changed: 0
            };

            for (const f of this.files) {
                switch (f.status) {
                    case 'A':
                    case '?':
                        this._diff.added++;
                        break;
                    case 'D':
                        this._diff.deleted++;
                        break;
                    default:
                        this._diff.changed++;
                        break;
                }
            }
        }

        if (options.expand) {
            let status = '';
            if (this._diff.added) {
                status += `${Strings.pluralize('file', this._diff.added)} added`;
            }
            if (this._diff.changed) {
                status += `${status === '' ? '' : options.separator}${this._diff.changed} ${Strings.pluralize(
                    'file',
                    this._diff.changed
                )} changed`;
            }
            if (this._diff.deleted) {
                status += `${status === '' ? '' : options.separator}${this._diff.deleted} ${Strings.pluralize(
                    'file',
                    this._diff.deleted
                )} deleted`;
            }
            return `${options.prefix}${status}`;
        }

        return `${options.prefix}+${this._diff.added}${options.separator}~${this._diff.changed}${options.separator}-${
            this._diff.deleted
        }`;
    }

    getUpstreamStatus(options: { empty?: string; expand?: boolean; prefix?: string; separator?: string }): string {
        return GitStatus.getUpstreamStatus(this.upstream, this.state, options);
    }

    static getUpstreamStatus(
        upstream: string | undefined,
        state: { ahead: number; behind: number },
        options: { empty?: string; expand?: boolean; prefix?: string; separator?: string } = {}
    ): string {
        options = { empty: '', prefix: '', separator: ' ', ...options };
        if (upstream === undefined || (state.behind === 0 && state.ahead === 0)) return options.empty!;

        if (options.expand) {
            let status = '';
            if (state.behind) {
                status += `${Strings.pluralize('commit', state.behind)} behind`;
            }
            if (state.ahead) {
                status += `${status === '' ? '' : options.separator}${Strings.pluralize('commit', state.ahead)} ahead`;
            }
            return `${options.prefix}${status}`;
        }

        return `${options.prefix}${state.behind}${GlyphChars.ArrowDown}${options.separator}${state.ahead}${
            GlyphChars.ArrowUp
        }`;
    }
}

export declare type GitStatusFileStatus = '!' | '?' | 'A' | 'C' | 'D' | 'M' | 'R' | 'T' | 'U' | 'X' | 'B';

export interface IGitStatusFile {
    status: GitStatusFileStatus;
    readonly fileName: string;
    readonly originalFileName?: string;
    readonly workTreeStatus: GitStatusFileStatus;
    readonly indexStatus: GitStatusFileStatus;
}

export interface IGitStatusFileWithCommit extends IGitStatusFile {
    readonly commit: GitLogCommit;
}

export class GitStatusFile implements IGitStatusFile {
    constructor(
        public readonly repoPath: string,
        public readonly indexStatus: GitStatusFileStatus,
        public readonly workTreeStatus: GitStatusFileStatus,
        public readonly fileName: string,
        public readonly originalFileName?: string
    ) {}

    get status(): GitStatusFileStatus {
        return (this.indexStatus || this.workTreeStatus || '?') as GitStatusFileStatus;
    }

    get staged() {
        return this.indexStatus !== undefined;
    }

    get uri(): Uri {
        return Uri.file(path.resolve(this.repoPath, this.fileName));
    }

    getFormattedDirectory(includeOriginal: boolean = false): string {
        return GitStatusFile.getFormattedDirectory(this, includeOriginal);
    }

    getFormattedPath(separator: string = Strings.pad(GlyphChars.Dot, 2, 2)): string {
        return GitStatusFile.getFormattedPath(this, separator);
    }

    getOcticon() {
        return getGitStatusOcticon(this.status);
    }

    getStatusText(status: IGitStatusFile): string {
        return GitStatusFile.getStatusText(this.status);
    }

    with(changes: {
        indexStatus?: GitStatusFileStatus | null;
        workTreeStatus?: GitStatusFileStatus | null;
        fileName?: string;
        originalFileName?: string | null;
    }): GitStatusFile {
        return new GitStatusFile(
            this.repoPath,
            this.getChangedValue(changes.indexStatus, this.indexStatus) as GitStatusFileStatus,
            this.getChangedValue(changes.workTreeStatus, this.workTreeStatus) as GitStatusFileStatus,
            changes.fileName || this.fileName,
            this.getChangedValue(changes.originalFileName, this.originalFileName)
        );
    }

    protected getChangedValue<T>(change: T | null | undefined, original: T | undefined): T | undefined {
        if (change === undefined) return original;
        return change !== null ? change : undefined;
    }

    static getFormattedDirectory(
        status: IGitStatusFile,
        includeOriginal: boolean = false,
        relativeTo?: string
    ): string {
        const directory = GitUri.getDirectory(status.fileName, relativeTo);
        return includeOriginal && status.status === 'R' && status.originalFileName
            ? `${directory} ${Strings.pad(GlyphChars.ArrowLeft, 1, 1)} ${status.originalFileName}`
            : directory;
    }

    static getFormattedPath(
        status: IGitStatusFile,
        separator: string = Strings.pad(GlyphChars.Dot, 2, 2),
        relativeTo?: string
    ): string {
        return GitUri.getFormattedPath(status.fileName, separator, relativeTo);
    }

    static getRelativePath(status: IGitStatusFile, relativeTo?: string): string {
        return GitUri.getRelativePath(status.fileName, relativeTo);
    }

    static getStatusText(status: GitStatusFileStatus): string {
        return getGitStatusText(status);
    }
}

const statusOcticonsMap = {
    '!': '$(diff-ignored)',
    '?': '$(diff-added)',
    A: '$(diff-added)',
    C: '$(diff-added)',
    D: '$(diff-removed)',
    M: '$(diff-modified)',
    R: '$(diff-renamed)',
    T: '$(diff-modified)',
    U: '$(alert)',
    X: '$(question)',
    B: '$(question)'
};

export function getGitStatusOcticon(status: GitStatusFileStatus, missing: string = GlyphChars.Space.repeat(4)): string {
    return statusOcticonsMap[status] || missing;
}

const statusIconsMap = {
    '!': 'icon-status-ignored.svg',
    '?': 'icon-status-untracked.svg',
    A: 'icon-status-added.svg',
    C: 'icon-status-copied.svg',
    D: 'icon-status-deleted.svg',
    M: 'icon-status-modified.svg',
    R: 'icon-status-renamed.svg',
    T: 'icon-status-modified.svg',
    U: 'icon-status-conflict.svg',
    X: 'icon-status-unknown.svg',
    B: 'icon-status-unknown.svg'
};

export function getGitStatusIcon(status: GitStatusFileStatus): string {
    return statusIconsMap[status] || statusIconsMap['X'];
}

const statusTextMap = {
    '!': 'ignored',
    '?': 'untracked',
    A: 'added',
    C: 'copied',
    D: 'deleted',
    M: 'modified',
    R: 'renamed',
    T: 'modified',
    U: 'conflict',
    X: 'unknown',
    B: 'unknown'
};

export function getGitStatusText(status: GitStatusFileStatus): string {
    return statusTextMap[status] || statusTextMap['X'];
}
