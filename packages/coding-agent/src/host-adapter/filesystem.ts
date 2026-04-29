import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises"

import type { DirEntryInfo, FileStat, FileSystemBackend } from "../types"

function toFileStat(stats: Awaited<ReturnType<typeof stat>> | Awaited<ReturnType<typeof lstat>>): FileStat {
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymbolicLink: stats.isSymbolicLink(),
    size: Number(stats.size),
    mtimeMs: Number(stats.mtimeMs),
  }
}

export function createLocalFileSystemBackend(): FileSystemBackend {
  return {
    async readFile(path) {
      return new Uint8Array(await readFile(path))
    },
    async writeFile(path, data) {
      await writeFile(path, data)
    },
    async readDir(path) {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry): DirEntryInfo => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymbolicLink: entry.isSymbolicLink(),
      }))
    },
    async stat(path) {
      return toFileStat(await lstat(path))
    },
    async exists(path) {
      try {
        await lstat(path)
        return true
      } catch {
        return false
      }
    },
    async realPath(path) {
      return realpath(path)
    },
    async mkdir(path, options) {
      await mkdir(path, options)
    },
    async remove(path, options) {
      await rm(path, { force: false, recursive: options?.recursive ?? false })
    },
    async rename(from, to) {
      await rename(from, to)
    },
  }
}
