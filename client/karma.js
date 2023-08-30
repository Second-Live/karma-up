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

  let resultsBufferLimit = 50
  let resultsBuffer = []

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

    if (resultsBufferLimit === 1) {
      this.updater.updateTestStatus('result')
      return socket.emit('result', convertedResult)
    }

    resultsBuffer.push(convertedResult)

    if (resultsBuffer.length === resultsBufferLimit) {
      socket.emit('result', resultsBuffer)
      this.updater.updateTestStatus('result')
      resultsBuffer = []
    }
  }

  this.complete = function (result) {
    if (resultsBuffer.length) {
      socket.emit('result', resultsBuffer)
      resultsBuffer = []
    }

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
    socket.io.engine.on('upgrade', function () {
      resultsBufferLimit = 1
      // Flush any results which were buffered before the upgrade to WebSocket protocol.
      if (resultsBuffer.length > 0) {
        socket.emit('result', resultsBuffer)
        resultsBuffer = []
      }
    })
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
