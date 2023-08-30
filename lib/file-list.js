'use strict'

const { promisify } = require('util')
const { glob } = require('glob')
const fs = require('graceful-fs')
const statAsync = promisify(fs.stat.bind(fs))
const pathLib = require('path')
const _ = require('lodash')

const File = require('./file')
const Url = require('./url')
const helper = require('./helper')
const log = require('./logger').create('filelist')
const createPatternObject = require('./config').createPatternObject

async function iterablePromise (iterable) {
  let resolvedIterable = []
  while (iterable.length !== resolvedIterable.length) {
    resolvedIterable = await Promise.all(iterable)
  }
  return resolvedIterable
}

class FileList {
  constructor (patterns, excludes, emitter, preprocess, autoWatchBatchDelay) {
    this._patterns = patterns || []
    this._excludes = excludes || []
    this._emitter = emitter
    this._preprocess = preprocess

    this.buckets = new Map()

    // A promise that is pending if and only if we are active in this.refresh_()
    this._refreshing = []

    const emit = () => {
      this._emitter.emit('file_list_modified', this.files)
    }

    const debouncedEmit = _.debounce(emit, autoWatchBatchDelay)
    this._emitModified = (immediate) => {
      immediate ? emit() : debouncedEmit()
    }
  }

  _findExcluded (path) {
    return this._excludes.find((pattern) => helper.mm(path, pattern))
  }

  _findIncluded (path) {
    return this._patterns.find((pattern) => helper.mm(path, pattern.pattern))
  }

  _findFile (path, pattern) {
    if (!path || !pattern) return
    return this._getFilesByPattern(pattern.pattern).find((file) => file.originalPath === path)
  }

  _exists (path) {
    return !!this._patterns.find((pattern) => helper.mm(path, pattern.pattern) && this._findFile(path, pattern))
  }

  _getFilesByPattern (pattern) {
    return this.buckets.get(pattern) || []
  }

  async _refresh () {
    const matchedFiles = new Set()
    const filesProcessing = []

    for (const { pattern, type, nocache, isBinary, integrity } of this._patterns) {
      if (helper.isUrlAbsolute(pattern)) {
        this.buckets.set(pattern, [new Url(pattern, type, integrity)])
        continue
      }

      // glob has issue with windows and tilde in paths
      const windowsPathsNoEscape = process.platform === 'win32' && !pattern.includes('~')
      const paths = await glob(pathLib.normalize(pattern), { cwd: '/', follow: true, nodir: true, withFileTypes: true, windowsPathsNoEscape })

      const files = paths.filter((file) => {
        const path = file.fullpath().replaceAll('\\', '/')
        if (this._findExcluded(path)) {
          log.debug(`Excluded file "${path}"`)
          return false
        } else if (matchedFiles.has(path)) {
          return false
        }
        log.debug(`Include file "${path}"`)
        matchedFiles.add(path)
        return true
      })
        .map((file) => new File(file.fullpath().replaceAll('\\', '/'), file.mtime, nocache, type, isBinary))

      if (nocache) {
        log.debug(`Not preprocessing "${pattern}" due to nocache`)
      } else {
        filesProcessing.push(...files)
      }

      this.buckets.set(pattern, files)

      if (!paths.length) {
        log.warn(`Pattern "${pattern}" does not match any file.`)
      } else if (!files.length) {
        log.warn(`All files matched by "${pattern}" were excluded or matched by prior matchers.`)
      }
    }
    return Promise.all(filesProcessing.map((file) => this._preprocess(file)))
  }

  get files () {
    const served = []
    const included = {}
    const lookup = {}
    this._patterns.forEach((p) => {
      // This needs to be here sadly, as plugins are modifiying
      // the _patterns directly resulting in elements not being
      // instantiated properly
      if (p.constructor.name !== 'Pattern') {
        p = createPatternObject(p)
      }

      const files = this._getFilesByPattern(p.pattern)
      files.sort((a, b) => {
        if (a.path > b.path) return 1
        if (a.path < b.path) return -1

        return 0
      })

      if (p.served) {
        served.push(...files)
      }

      files.forEach((file) => {
        if (lookup[file.path] && lookup[file.path].compare(p) < 0) return

        lookup[file.path] = p
        if (p.included) {
          included[file.path] = file
        } else {
          delete included[file.path]
        }
      })
    })

    return {
      served: _.uniq(served, 'path'),
      included: Object.values(included)
    }
  }

  refresh () {
    this._refreshing.push(this._refresh())
    if (this._refreshing.length > 1) {
      return iterablePromise(this._refreshing).then(() => this.files)
    }
    return iterablePromise(this._refreshing).then(() => {
      // When we return from this function the file processing chain will be
      // complete. In the case of two fast refresh() calls, the second call
      // will overwrite this._refreshing, and we want the status to reflect
      // the second call and skip the modification event from the first call.
      this._refreshing = []
      this._emitModified(true)
      return this.files
    })
  }

  reload (patterns, excludes) {
    this._patterns = patterns || []
    this._excludes = excludes || []

    return this.refresh()
  }

  async addFile (path) {
    const excluded = this._findExcluded(path)
    if (excluded) {
      log.debug(`Add file "${path}" ignored. Excluded by "${excluded}".`)
      return this.files
    }

    const pattern = this._findIncluded(path)
    if (!pattern) {
      log.debug(`Add file "${path}" ignored. Does not match any pattern.`)
      return this.files
    }

    if (this._exists(path)) {
      log.debug(`Add file "${path}" ignored. Already in the list.`)
      return this.files
    }

    const file = new File(path)
    this._getFilesByPattern(pattern.pattern).push(file)

    const [stat] = await Promise.all([statAsync(path), iterablePromise(this._refreshing)])
    file.mtime = stat.mtime
    await this._preprocess(file)

    log.info(`Added file "${path}".`)
    this._emitModified()
    return this.files
  }

  async changeFile (path, force) {
    const pattern = this._findIncluded(path)
    const file = this._findFile(path, pattern)

    if (!file) {
      log.debug(`Changed file "${path}" ignored. Does not match any file in the list.`)
      return this.files
    }

    const [stat] = await Promise.all([statAsync(path), iterablePromise(this._refreshing)])
    if (force || stat.mtime > file.mtime) {
      file.mtime = stat.mtime
      await this._preprocess(file)
      log.info(`Changed file "${path}".`)
      this._emitModified(force)
    }
    return this.files
  }

  async removeFile (path) {
    const pattern = this._findIncluded(path)
    const file = this._findFile(path, pattern)

    if (file) {
      helper.arrayRemove(this._getFilesByPattern(pattern.pattern), file)
      log.info(`Removed file "${path}".`)

      this._emitModified()
    } else {
      log.debug(`Removed file "${path}" ignored. Does not match any file in the list.`)
    }
    return this.files
  }
}

FileList.factory = function (config, emitter, preprocess) {
  return new FileList(config.files, config.exclude, emitter, preprocess, config.autoWatchBatchDelay)
}

FileList.factory.$inject = ['config', 'emitter', 'preprocess']

module.exports = FileList
