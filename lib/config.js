'use strict'

const path = require('path')
const url = require('url')
const assert = require('assert')

const logger = require('./logger')
const log = logger.create('config')
const helper = require('./helper')
const constant = require('./constants')

const _ = require('lodash')

class Pattern {
  constructor (pattern, served, included, watched, nocache, type, isBinary, integrity) {
    this.pattern = pattern
    this.served = helper.isDefined(served) ? served : true
    this.included = helper.isDefined(included) ? included : true
    this.watched = helper.isDefined(watched) ? watched : true
    this.nocache = helper.isDefined(nocache) ? nocache : false
    this.weight = helper.mmPatternWeight(pattern)
    this.type = type
    this.isBinary = isBinary
    this.integrity = integrity
  }

  compare (other) {
    return helper.mmComparePatternWeights(this.weight, other.weight)
  }
}

class UrlPattern extends Pattern {
  constructor (url, type, integrity) {
    super(url, false, true, false, false, type, undefined, integrity)
  }
}

function createPatternObject (pattern) {
  if (pattern && helper.isString(pattern)) {
    return helper.isUrlAbsolute(pattern)
      ? new UrlPattern(pattern)
      : new Pattern(pattern)
  } else if (helper.isObject(pattern) && pattern.pattern && helper.isString(pattern.pattern)) {
    return helper.isUrlAbsolute(pattern.pattern)
      ? new UrlPattern(pattern.pattern, pattern.type, pattern.integrity)
      : new Pattern(pattern.pattern, pattern.served, pattern.included, pattern.watched, pattern.nocache, pattern.type)
  } else {
    log.warn(`Invalid pattern ${pattern}!\n\tExpected string or object with "pattern" property.`)
    return new Pattern(null, false, false, false, false)
  }
}

function normalizeUrl (url) {
  if (!url.startsWith('/')) {
    url = `/${url}`
  }

  if (!url.endsWith('/')) {
    url = url + '/'
  }

  return url
}

function normalizeUrlRoot (urlRoot) {
  const normalizedUrlRoot = normalizeUrl(urlRoot)

  if (normalizedUrlRoot !== urlRoot) {
    log.warn(`urlRoot normalized to "${normalizedUrlRoot}"`)
  }

  return normalizedUrlRoot
}

function normalizeProxyPath (proxyPath) {
  const normalizedProxyPath = normalizeUrl(proxyPath)

  if (normalizedProxyPath !== proxyPath) {
    log.warn(`proxyPath normalized to "${normalizedProxyPath}"`)
  }

  return normalizedProxyPath
}

function normalizeConfig (config, configFilePath) {
  function basePathResolve (relativePath) {
    if (helper.isUrlAbsolute(relativePath)) {
      return relativePath
    } else if (helper.isDefined(config.basePath) && helper.isDefined(relativePath)) {
      return path.resolve(config.basePath, relativePath)
    } else {
      return ''
    }
  }

  function createPatternMapper (resolve) {
    return (objectPattern) => Object.assign(objectPattern, { pattern: resolve(objectPattern.pattern) })
  }

  if (helper.isString(configFilePath)) {
    config.basePath = path.resolve(path.dirname(configFilePath), config.basePath) // resolve basePath
    config.exclude.push(configFilePath) // always ignore the config file itself
  } else {
    config.basePath = path.resolve(config.basePath || '.')
  }

  config.files = config.files.map(createPatternObject).map(createPatternMapper(basePathResolve))
  config.exclude = config.exclude.map(basePathResolve)
  config.customContextFile = config.customContextFile && basePathResolve(config.customContextFile)
  config.customDebugFile = config.customDebugFile && basePathResolve(config.customDebugFile)
  config.customClientContextFile = config.customClientContextFile && basePathResolve(config.customClientContextFile)

  // normalize paths on windows
  config.basePath = helper.normalizeWinPath(config.basePath)
  config.files = config.files.map(createPatternMapper(helper.normalizeWinPath))
  config.exclude = config.exclude.map(helper.normalizeWinPath)
  config.customContextFile = helper.normalizeWinPath(config.customContextFile)
  config.customDebugFile = helper.normalizeWinPath(config.customDebugFile)
  config.customClientContextFile = helper.normalizeWinPath(config.customClientContextFile)

  // normalize urlRoot
  config.urlRoot = normalizeUrlRoot(config.urlRoot)

  // normalize and default upstream proxy settings if given
  if (config.upstreamProxy) {
    const proxy = config.upstreamProxy
    proxy.path = helper.isDefined(proxy.path) ? normalizeProxyPath(proxy.path) : '/'
    proxy.hostname = proxy.hostname ?? '127.0.0.1'
    proxy.port = proxy.port ?? 9875

    // force protocol to end with ':'
    proxy.protocol = (proxy.protocol || 'http').split(':')[0] + ':'
    if (proxy.protocol.match(/https?:/) === null) {
      log.warn(`"${proxy.protocol}" is not a supported upstream proxy protocol, defaulting to "http:"`)
      proxy.protocol = 'http:'
    }
  }

  // force protocol to end with ':'
  config.protocol = (config.protocol || 'http').split(':')[0] + ':'
  if (config.protocol.match(/https?:/) === null) {
    log.warn(`"${config.protocol}" is not a supported protocol, defaulting to "http:"`)
    config.protocol = 'http:'
  }

  if (config.proxies && Object.prototype.hasOwnProperty.call(config.proxies, config.urlRoot)) {
    log.warn(`"${config.urlRoot}" is proxied, you should probably change urlRoot to avoid conflicts`)
  }

  if (config.singleRun && config.autoWatch) {
    log.debug('autoWatch set to false, because of singleRun')
    config.autoWatch = false
  }

  if (config.runInParent) {
    log.debug('useIframe set to false, because using runInParent')
    config.useIframe = false
  }

  if (!config.singleRun && !config.useIframe && config.runInParent) {
    log.debug('singleRun set to true, because using runInParent')
    config.singleRun = true
  }

  if (helper.isString(config.reporters)) {
    config.reporters = config.reporters.split(',')
  }

  if (config.client && config.client.args) {
    assert(Array.isArray(config.client.args), 'Invalid configuration: client.args must be an array of strings')
  }

  if (config.browsers) {
    assert(Array.isArray(config.browsers), 'Invalid configuration: browsers option must be an array')
  }

  if (config.formatError) {
    assert(helper.isFunction(config.formatError), 'Invalid configuration: formatError option must be a function.')
  }

  if (config.processKillTimeout) {
    assert(helper.isNumber(config.processKillTimeout), 'Invalid configuration: processKillTimeout option must be a number.')
  }

  if (config.browserSocketTimeout) {
    assert(helper.isNumber(config.browserSocketTimeout), 'Invalid configuration: browserSocketTimeout option must be a number.')
  }

  if (config.pingTimeout) {
    assert(helper.isNumber(config.pingTimeout), 'Invalid configuration: pingTimeout option must be a number.')
  }

  const defaultClient = config.defaultClient || {}
  Object.keys(defaultClient).forEach(function (key) {
    const option = config.client[key]
    config.client[key] = helper.isDefined(option) ? option : defaultClient[key]
  })

  // normalize preprocessors
  const preprocessors = config.preprocessors || {}
  const normalizedPreprocessors = config.preprocessors = Object.create(null)

  Object.keys(preprocessors).forEach(function (pattern) {
    const normalizedPattern = helper.normalizeWinPath(basePathResolve(pattern))

    normalizedPreprocessors[normalizedPattern] = helper.isString(preprocessors[pattern])
      ? [preprocessors[pattern]]
      : preprocessors[pattern]
  })

  // define custom launchers/preprocessors/reporters - create a new plugin
  const module = Object.create(null)
  let hasSomeInlinedPlugin = false
  const types = ['launcher', 'preprocessor', 'reporter']

  types.forEach(function (type) {
    const definitions = config[`custom${helper.ucFirst(type)}s`] || {}

    Object.keys(definitions).forEach(function (name) {
      const definition = definitions[name]

      if (!helper.isObject(definition)) {
        return log.warn(`Can not define ${type} ${name}. Definition has to be an object.`)
      }

      if (!helper.isString(definition.base)) {
        return log.warn(`Can not define ${type} ${name}. Missing base ${type}.`)
      }

      const token = type + ':' + definition.base
      const locals = {
        args: ['value', definition]
      }

      module[type + ':' + name] = ['factory', function (injector) {
        const plugin = injector.createChild([locals], [token]).get(token)
        if (type === 'launcher' && helper.isDefined(definition.displayName)) {
          plugin.displayName = definition.displayName
        }
        return plugin
      }]
      hasSomeInlinedPlugin = true
    })
  })

  if (hasSomeInlinedPlugin) {
    config.plugins.push(module)
  }

  return config
}

/**
 * @class
 */
class Config {
  constructor () {
    this.LOG_DISABLE = constant.LOG_DISABLE
    this.LOG_ERROR = constant.LOG_ERROR
    this.LOG_WARN = constant.LOG_WARN
    this.LOG_INFO = constant.LOG_INFO
    this.LOG_DEBUG = constant.LOG_DEBUG

    // DEFAULT CONFIG
    this.frameworks = []
    this.protocol = 'http:'
    this.port = constant.DEFAULT_PORT
    this.listenAddress = constant.DEFAULT_LISTEN_ADDR
    this.hostname = constant.DEFAULT_HOSTNAME
    this.httpsServerConfig = {}
    this.basePath = ''
    this.files = []
    this.browserConsoleLogOptions = {
      level: 'debug',
      format: '%b %T: %m',
      terminal: true
    }
    this.customContextFile = null
    this.customDebugFile = null
    this.customClientContextFile = null
    this.exclude = []
    this.logLevel = constant.LOG_INFO
    this.colors = true
    this.autoWatch = true
    this.autoWatchBatchDelay = 250
    this.restartOnFileChange = false
    this.usePolling = process.platform === 'linux'
    this.reporters = ['progress']
    this.singleRun = false
    this.browsers = []
    this.captureTimeout = 60000
    this.pingTimeout = 5000
    this.proxies = {}
    this.proxyValidateSSL = true
    this.preprocessors = {}
    this.preprocessor_priority = {}
    this.urlRoot = '/'
    this.upstreamProxy = undefined
    this.reportSlowerThan = 0
    this.loggers = [constant.CONSOLE_APPENDER]
    this.transports = ['polling', 'websocket']
    this.forceJSONP = false
    this.plugins = ['karma-*']
    this.defaultClient = this.client = {
      args: [],
      useIframe: true,
      runInParent: false,
      captureConsole: true,
      clearContext: true,
      allowedReturnUrlPatterns: ['^https?://']
    }
    this.browserDisconnectTimeout = 2000
    this.browserDisconnectTolerance = 0
    this.browserNoActivityTimeout = 30000
    this.processKillTimeout = 2000
    this.concurrency = Infinity
    this.failOnEmptyTestSuite = true
    this.retryLimit = 2
    this.detached = false
    this.crossOriginAttribute = true
    this.browserSocketTimeout = 20000
  }

  set (newConfig) {
    _.mergeWith(this, newConfig, (obj, src) => {
      // Overwrite arrays to keep consistent with #283
      if (Array.isArray(src)) {
        return src
      }
    })
  }
}

const CONFIG_SYNTAX_HELP = '  module.exports = function(config) {\n' +
  '    config.set({\n' +
  '      // your config\n' +
  '    });\n' +
  '  };\n'

/**
 * Retrieve a parsed and finalized Karma `Config` instance. This `karmaConfig`
 * object may be used to configure public API methods such a `Server`,
 * `runner.run`, and `stopper.stop`.
 *
 * @param {?string} [configFilePath=null]
 *     A string representing a file system path pointing to the config file
 *     whose default export is a function that will be used to set Karma
 *     configuration options. This function will be passed an instance of the
 *     `Config` class as its first argument. If this option is not provided,
 *     then only the options provided by the `cliOptions` argument will be
 *     set.
 * @param {Object} cliOptions
 *     An object whose values will take priority over options set in the
 *     config file. The config object passed to function exported by the
 *     config file will already have these options applied. Any changes the
 *     config file makes to these options will effectively be ignored in the
 *     final configuration.
 *
 *     `cliOptions` all the same options as the config file and is applied
 *     using the same `config.set()` method.
 * @returns {Promise<Config>}
 */
async function parseConfig (configFilePath, cliOptions = {}) {
  // `setupFromConfig` provides defaults for `colors` and `logLevel`.
  // `setup` provides defaults for `appenders`
  // The first argument MUST BE an object
  logger.setupFromConfig({})

  const fail = (...args) => {
    log.error(...args)
    throw new Error(args.join(' '))
  }

  let configModule = () => {} // if no config file path is passed, we define a dummy config module.
  if (configFilePath) {
    try {
      configModule = await import(url.pathToFileURL(configFilePath))
      if (typeof configModule === 'object' && typeof configModule.default !== 'undefined') {
        configModule = configModule.default
      }
    } catch (e) {
      return fail('Error in config file!\n  ' + e.stack || e)
    }
    if (!helper.isFunction(configModule)) {
      return fail('Config file must export a function!\n' + CONFIG_SYNTAX_HELP)
    }
  }

  const config = new Config()

  // save and reset hostname and listenAddress so we can detect if the user
  // changed them
  const defaultHostname = config.hostname
  config.hostname = null
  const defaultListenAddress = config.listenAddress
  config.listenAddress = null

  // add the user's configuration in
  config.set(cliOptions)

  try {
    await configModule(config)
  } catch (e) {
    return fail('Error in config file!\n', e)
  }

  // merge the config from config file and cliOptions (precedence)
  config.set(cliOptions)

  // if the user changed listenAddress, but didn't set a hostname, warn them
  if (config.hostname === null && config.listenAddress !== null) {
    log.warn(`ListenAddress was set to ${config.listenAddress} but hostname was left as the default: ` +
    `${defaultHostname}. If your browsers fail to connect, consider changing the hostname option.`)
  }
  // restore values that weren't overwritten by the user
  if (config.hostname === null) {
    config.hostname = defaultHostname
  }
  if (config.listenAddress === null) {
    config.listenAddress = defaultListenAddress
  }

  // configure the logger as soon as we can
  logger.setup(config.logLevel, config.colors, config.loggers)

  log.debug(configFilePath ? `Loading config ${configFilePath}` : 'No config file specified.')

  return normalizeConfig(config, configFilePath)
}

// PUBLIC API
exports.parseConfig = parseConfig
exports.Pattern = Pattern
exports.createPatternObject = createPatternObject
exports.Config = Config
