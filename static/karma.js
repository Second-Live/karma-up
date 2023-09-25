(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
module.exports = {
  VERSION: '%KARMA_VERSION%',
  KARMA_URL_ROOT: '%KARMA_URL_ROOT%',
  KARMA_PROXY_PATH: '%KARMA_PROXY_PATH%',
  BROWSER_SOCKET_TIMEOUT: '%BROWSER_SOCKET_TIMEOUT%',
  CONTEXT_URL: 'context.html'
}

},{}],2:[function(require,module,exports){
const stringify = require('../common/stringify')
const constant = require('./constants')
const util = require('../common/util')

function Karma (updater, socket, iframe, opener, navigator, location, document) {
  this.updater = updater
  let startEmitted = false
  const queryParams = new URLSearchParams(location.search)
  const browserId = queryParams.get('id') || util.generateId('manual-')
  const displayName = queryParams.get('displayName')
  const returnUrl = queryParams.get('return_url')

  // This is a no-op if not running with a Trusted Types CSP policy, and
  // lets tests declare that they trust the way that karma creates and handles
  // URLs.
  //
  // More info about the proposed Trusted Types standard at
  // https://github.com/WICG/trusted-types
  let policy = {
    createURL (s) {
      return s
    },
    createScriptURL (s) {
      return s
    }
  }
  const trustedTypes = window.trustedTypes || window.TrustedTypes
  if (trustedTypes) {
    policy = trustedTypes.createPolicy('karma', policy)
    if (!policy.createURL) {
      // Install createURL for newer browsers. Only browsers that implement an
      //     old version of the spec require createURL.
      //     Should be safe to delete all reference to createURL by
      //     February 2020.
      // https://github.com/WICG/trusted-types/pull/204
      policy.createURL = function (s) { return s }
    }
  }

  // To start we will signal the server that we are not reconnecting. If the socket loses
  // connection and was able to reconnect to the Karma server we will get a
  // second 'connect' event. There we will pass 'true' and that will be passed to the
  // Karma server then, so that Karma can differentiate between a socket client
  // econnect and a full browser reconnect.
  let socketReconnect = false

  this.VERSION = constant.VERSION
  this.config = {}

  // Expose for testing purposes as there is no global socket.io
  // registry anymore.
  this.socket = socket

  // Set up postMessage bindings for current window
  // DEV: These are to allow windows in separate processes execute local tasks
  //   Electron is one of these environments
  window.addEventListener('message', (evt) => {
    // Resolve the origin of our message
    const origin = evt.origin || evt.originalEvent.origin

    // If the message isn't from our host, then reject it
    if (origin !== window.location.origin) {
      return
    }

    // Take action based on the message type
    const method = evt.data.__karmaMethod
    if (method) {
      if (!this[method]) {
        this.error('Received `postMessage` for "' + method + '" but the method doesn\'t exist')
        return
      }
      this[method].apply(this, evt.data.__karmaArguments)
    }
  }, false)

  let childWindow = null
  const navigateContextTo = (url) => {
    if (this.config.useIframe === false) {
      // run in new window
      if (this.config.runInParent === false) {
        // If there is a window already open, then close it
        // DEV: In some environments (e.g. Electron), we don't have setter access for location
        if (childWindow !== null && childWindow.closed !== true) {
          // The onbeforeunload listener was added by context to catch
          // unexpected navigations while running tests.
          childWindow.onbeforeunload = undefined
          childWindow.close()
        }
        childWindow = opener(url)
        if (childWindow === null) {
          this.error('Opening a new tab/window failed, probably because pop-ups are blocked.')
        }
      // run context on parent element (client_with_context)
      // using window.__karma__.scriptUrls to get the html element strings and load them dynamically
      } else if (url !== 'about:blank') {
        const loadScript = function (idx) {
          if (idx < window.__karma__.scriptUrls.length) {
            const parser = new DOMParser()
            // Revert escaped characters with special roles in HTML before parsing
            const string = window.__karma__.scriptUrls[idx]
              .replace(/\\x3C/g, '<')
              .replace(/\\x3E/g, '>')
            const doc = parser.parseFromString(string, 'text/html')
            let ele = doc.head.firstChild || doc.body.firstChild
            // script elements created by DomParser are marked as unexecutable,
            // create a new script element manually and copy necessary properties
            // so it is executable
            if (ele.tagName && ele.tagName.toLowerCase() === 'script') {
              const tmp = ele
              ele = document.createElement('script')
              ele.src = policy.createScriptURL(tmp.src)
              ele.crossOrigin = tmp.crossOrigin
            }
            ele.onload = function () {
              loadScript(idx + 1)
            }
            document.body.appendChild(ele)
          } else {
            window.__karma__.loaded()
          }
        }
        loadScript(0)
      }
    // run in iframe
    } else {
      // The onbeforeunload listener was added by the context to catch
      // unexpected navigations while running tests.
      iframe.contentWindow.onbeforeunload = undefined
      iframe.src = policy.createURL(url)
    }
  }

  this.log = function (type, args) {
    const values = args.map((v) => this.stringify(v, 3))
    this.info({ log: values.join(', '), type })
  }

  this.stringify = stringify

  function getLocation (url, lineno, colno) {
    let location = ''

    if (url !== undefined) {
      location += url
    }

    if (lineno !== undefined) {
      location += ':' + lineno
    }

    if (colno !== undefined) {
      location += ':' + colno
    }

    return location
  }

  // error during js file loading (most likely syntax error)
  // we are not going to execute at all. `window.onerror` callback.
  this.error = function (messageOrEvent, source, lineno, colno, error) {
    let message
    if (typeof messageOrEvent === 'string') {
      message = messageOrEvent

      const location = getLocation(source, lineno, colno)
      if (location !== '') {
        message += '\nat ' + location
      }
      if (error && error.stack) {
        message += '\n\n' + error.stack
      }
    } else {
      // create an object with the string representation of the message to
      // ensure all its content is properly transferred to the console log
      message = { message: messageOrEvent, str: messageOrEvent.toString() }
    }

    socket.emit('karma_error', message)
    this.updater.updateTestStatus('karma_error ' + message)
    this.complete()
    return false
  }

  this.result = function (originalResult) {
    const convertedResult = {}

    // Convert all array-like objects to real arrays.
    for (const propertyName in originalResult) {
      if (Object.hasOwn(originalResult, propertyName)) {
        const propertyValue = originalResult[propertyName]

        if (Array.isArray(propertyValue)) {
          convertedResult[propertyName] = [...propertyValue]
        } else {
          convertedResult[propertyName] = propertyValue
        }
      }
    }

    if (!startEmitted) {
      socket.emit('start', { total: null })
      this.updater.updateTestStatus('start')
      startEmitted = true
    }

    this.updater.updateTestStatus('result')
    return socket.emit('result', convertedResult)
  }

  this.complete = function (result) {
    socket.emit('complete', result || {})
    if (this.config.clearContext) {
      navigateContextTo('about:blank')
    } else {
      this.updater.updateTestStatus('complete')
    }
    if (returnUrl) {
      let isReturnUrlAllowed = false
      for (let i = 0; i < this.config.allowedReturnUrlPatterns.length; i++) {
        const allowedReturnUrlPattern = new RegExp(this.config.allowedReturnUrlPatterns[i])
        if (allowedReturnUrlPattern.test(returnUrl)) {
          isReturnUrlAllowed = true
          break
        }
      }
      if (!isReturnUrlAllowed) {
        throw new Error(
          'Security: Navigation to '.concat(
            returnUrl,
            ' was blocked to prevent malicious exploits.'
          )
        )
      }
      location.href = returnUrl
    }
  }

  this.info = function (info) {
    // TODO(vojta): introduce special API for this
    if (!startEmitted && util.isDefined(info.total)) {
      socket.emit('start', info)
      startEmitted = true
    } else {
      socket.emit('info', info)
    }
  }

  socket.on('execute', (cfg) => {
    this.updater.updateTestStatus('execute')
    // reset startEmitted and reload the iframe
    startEmitted = false
    this.config = cfg

    navigateContextTo(constant.CONTEXT_URL)

    if (this.config.clientDisplayNone) {
      [].forEach.call(document.querySelectorAll('#banner, #browsers'), (el) => { el.hidden = true })
    }

    // clear the console before run
    // works only on FF (Safari, Chrome do not allow to clear console from js source)
    if (window.console && window.console.clear) {
      window.console.clear()
    }
  })
  socket.on('stop', () => this.complete())

  // Report the browser name and Id. Note that this event can also fire if the connection has
  // been temporarily lost, but the socket reconnected automatically. Read more in the docs:
  // https://socket.io/docs/client-api/#Event-%E2%80%98connect%E2%80%99
  socket.on('connect', function () {
    const info = {
      name: navigator.userAgent,
      id: browserId,
      isSocketReconnect: socketReconnect
    }
    if (displayName) {
      info.displayName = displayName
    }
    socket.emit('register', info)
    socketReconnect = true
  })
}

module.exports = Karma

},{"../common/stringify":5,"../common/util":6,"./constants":1}],3:[function(require,module,exports){
/* global io */
/* eslint-disable no-new */

const Karma = require('./karma')
const StatusUpdater = require('./updater')
const util = require('../common/util')
const constants = require('./constants')

const KARMA_URL_ROOT = constants.KARMA_URL_ROOT
const KARMA_PROXY_PATH = constants.KARMA_PROXY_PATH
const BROWSER_SOCKET_TIMEOUT = constants.BROWSER_SOCKET_TIMEOUT

// Connect to the server using socket.io https://socket.io/
const socket = io(location.host, {
  reconnectionDelay: 500,
  reconnectionDelayMax: Infinity,
  timeout: BROWSER_SOCKET_TIMEOUT,
  transports: ["websocket", "webtransport"],
  path: KARMA_PROXY_PATH + KARMA_URL_ROOT.slice(1) + 'socket.io',
  'sync disconnect on unload': true,
  useNativeTimers: true,
  closeOnBeforeunload: true
})

// instantiate the updater of the view
const updater = new StatusUpdater(socket, util.elm('title'), util.elm('banner'), util.elm('browsers'))
window.karma = new Karma(updater, socket, util.elm('context'), window.open,
  window.navigator, window.location, window.document)

},{"../common/util":6,"./constants":1,"./karma":2,"./updater":4}],4:[function(require,module,exports){
const VERSION = require('./constants').VERSION

function StatusUpdater (socket, titleElement, bannerElement, browsersElement) {
  function updateBrowsersInfo (browsers) {
    if (!browsersElement) {
      return
    }
    const elems = browsers.map(({ isConnected, name }) => {
      const status = isConnected ? 'idle' : 'executing'
      const li = document.createElement('li')
      li.className = status
      li.textContent = `${name} is ${status}`
      return li
    })
    browsersElement.replaceChildren(...elems)
  }

  let connectionText = 'never-connected'
  let testText = 'loading'
  let pingText = ''

  function updateBanner () {
    if (!titleElement || !bannerElement) {
      return
    }
    titleElement.textContent = `Karma v ${VERSION} - ${connectionText}; test: ${testText}; ${pingText}`
    bannerElement.className = connectionText === 'connected' ? 'online' : 'offline'
  }

  function updateConnectionStatus (connectionStatus) {
    connectionText = connectionStatus || connectionText
    updateBanner()
  }
  function updateTestStatus (testStatus) {
    testText = testStatus || testText
    updateBanner()
  }
  function updatePingStatus (pingStatus) {
    pingText = pingStatus || pingText
    updateBanner()
  }

  socket.on('connect', function () {
    updateConnectionStatus('connected')
  })
  socket.on('disconnect', function () {
    updateConnectionStatus('disconnected')
  })
  socket.on('reconnecting', function (sec) {
    updateConnectionStatus('reconnecting in ' + sec + ' seconds')
  })
  socket.on('reconnect', function () {
    updateConnectionStatus('reconnected')
  })
  socket.on('reconnect_failed', function () {
    updateConnectionStatus('reconnect_failed')
  })

  socket.on('info', updateBrowsersInfo)
  socket.on('disconnect', function () {
    updateBrowsersInfo([])
  })

  socket.on('ping', function () {
    updatePingStatus('ping...')
  })
  socket.on('pong', function (latency) {
    updatePingStatus('ping ' + latency + 'ms')
  })

  return { updateTestStatus }
}

module.exports = StatusUpdater

},{"./constants":1}],5:[function(require,module,exports){
var instanceOf = require('./util').instanceOf

function isNode (obj) {
  return (obj.tagName || obj.nodeName) && obj.nodeType
}

function stringify (obj, depth) {
  if (depth === 0) {
    return '...'
  }

  if (obj === null) {
    return 'null'
  }

  switch (typeof obj) {
    case 'symbol':
      return obj.toString()
    case 'string':
      return "'" + obj + "'"
    case 'undefined':
      return 'undefined'
    case 'function':
      try {
        // function abc(a, b, c) { /* code goes here */ }
        //   -> function abc(a, b, c) { ... }
        return obj.toString().replace(/\{[\s\S]*\}/, '{ ... }')
      } catch (err) {
        if (err instanceof TypeError) {
          // Support older browsers
          return 'function ' + (obj.name || '') + '() { ... }'
        } else {
          throw err
        }
      }
    case 'boolean':
      return obj ? 'true' : 'false'
    case 'object':
      var strs = []
      if (instanceOf(obj, 'Array')) {
        strs.push('[')
        for (var i = 0, ii = obj.length; i < ii; i++) {
          if (i) {
            strs.push(', ')
          }
          strs.push(stringify(obj[i], depth - 1))
        }
        strs.push(']')
      } else if (instanceOf(obj, 'Date')) {
        return obj.toString()
      } else if (instanceOf(obj, 'Text')) {
        return obj.nodeValue
      } else if (instanceOf(obj, 'Comment')) {
        return '<!--' + obj.nodeValue + '-->'
      } else if (obj.outerHTML) {
        return obj.outerHTML
      } else if (isNode(obj)) {
        return new window.XMLSerializer().serializeToString(obj)
      } else if (instanceOf(obj, 'Error')) {
        return obj.toString() + '\n' + obj.stack
      } else {
        var constructor = 'Object'
        if (obj.constructor && typeof obj.constructor === 'function') {
          constructor = obj.constructor.name
        }

        strs.push(constructor)
        strs.push('{')
        var first = true
        for (var key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (first) {
              first = false
            } else {
              strs.push(', ')
            }

            strs.push(key + ': ' + stringify(obj[key], depth - 1))
          }
        }
        strs.push('}')
      }
      return strs.join('')
    default:
      return obj
  }
}

module.exports = stringify

},{"./util":6}],6:[function(require,module,exports){
exports.instanceOf = function (value, constructorName) {
  return Object.prototype.toString.apply(value) === '[object ' + constructorName + ']'
}

exports.elm = function (id) {
  return document.getElementById(id)
}

exports.generateId = function (prefix) {
  return prefix + Math.floor(Math.random() * 10000)
}

exports.isUndefined = function (value) {
  return typeof value === 'undefined'
}

exports.isDefined = function (value) {
  return !exports.isUndefined(value)
}

},{}]},{},[3]);
