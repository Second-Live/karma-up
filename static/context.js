(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{"./util":2}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
// Load our dependencies
var stringify = require('../common/stringify')

// Define our context Karma constructor
function ContextKarma (callParentKarmaMethod) {
  // Define local variables
  var hasError = false
  var self = this
  var isLoaded = false

  // Define our loggers
  // DEV: These are intentionally repeated in client and context
  this.log = function (type, args) {
    var values = []

    for (var i = 0; i < args.length; i++) {
      values.push(this.stringify(args[i], 3))
    }

    this.info({ log: values.join(', '), type: type })
  }

  this.stringify = stringify

  // Define our proxy error handler
  // DEV: We require one in our context to track `hasError`
  this.error = function () {
    hasError = true
    callParentKarmaMethod('error', [].slice.call(arguments))
    return false
  }

  // Define our start handler
  function UNIMPLEMENTED_START () {
    this.error('You need to include some adapter that implements __karma__.start method!')
  }
  // all files loaded, let's start the execution
  this.loaded = function () {
    // has error -> cancel
    if (!hasError && !isLoaded) {
      isLoaded = true
      try {
        this.start(this.config)
      } catch (error) {
        this.error(error.stack || error.toString())
      }
    }

    // remove reference to child iframe
    this.start = UNIMPLEMENTED_START
  }
  // supposed to be overridden by the context
  // TODO(vojta): support multiple callbacks (queue)
  this.start = UNIMPLEMENTED_START

  // Define proxy methods
  // DEV: This is a closured `for` loop (same as a `forEach`) for IE support
  var proxyMethods = ['complete', 'info', 'result']
  for (var i = 0; i < proxyMethods.length; i++) {
    (function bindProxyMethod (methodName) {
      self[methodName] = function boundProxyMethod () {
        callParentKarmaMethod(methodName, [].slice.call(arguments))
      }
    }(proxyMethods[i]))
  }

  // Define bindings for context window
  this.setupContext = function (contextWindow) {
    // If we clear the context after every run and we already had an error
    //   then stop now. Otherwise, carry on.
    if (self.config.clearContext && hasError) {
      return
    }

    // Perform window level bindings
    // DEV: We return `self.error` since we want to `return false` to ignore errors
    contextWindow.onerror = function () {
      return self.error.apply(self, arguments)
    }

    contextWindow.onbeforeunload = function () {
      return self.error('Some of your tests did a full page reload!')
    }

    contextWindow.dump = function () {
      self.log('dump', arguments)
    }

    var _confirm = contextWindow.confirm
    var _prompt = contextWindow.prompt

    contextWindow.alert = function (msg) {
      self.log('alert', [msg])
    }

    contextWindow.confirm = function (msg) {
      self.log('confirm', [msg])
      return _confirm(msg)
    }

    contextWindow.prompt = function (msg, defaultVal) {
      self.log('prompt', [msg, defaultVal])
      return _prompt(msg, defaultVal)
    }

    // If we want to overload our console, then do it
    function getConsole (currentWindow) {
      return currentWindow.console || {
        log: function () {},
        info: function () {},
        warn: function () {},
        error: function () {},
        debug: function () {}
      }
    }
    if (self.config.captureConsole) {
      // patch the console
      var localConsole = contextWindow.console = getConsole(contextWindow)
      var logMethods = ['log', 'info', 'warn', 'error', 'debug']
      var patchConsoleMethod = function (method) {
        var orig = localConsole[method]
        if (!orig) {
          return
        }
        localConsole[method] = function () {
          self.log(method, arguments)
          try {
            return Function.prototype.apply.call(orig, localConsole, arguments)
          } catch (error) {
            self.log('warn', ['Console method ' + method + ' threw: ' + error])
          }
        }
      }
      for (var i = 0; i < logMethods.length; i++) {
        patchConsoleMethod(logMethods[i])
      }
    }
  }
}

// Define call/proxy methods
ContextKarma.getDirectCallParentKarmaMethod = function (parentWindow) {
  return function directCallParentKarmaMethod (method, args) {
    // If the method doesn't exist, then error out
    if (!parentWindow.karma[method]) {
      parentWindow.karma.error('Expected Karma method "' + method + '" to exist but it doesn\'t')
      return
    }

    // Otherwise, run our method
    parentWindow.karma[method].apply(parentWindow.karma, args)
  }
}
ContextKarma.getPostMessageCallParentKarmaMethod = function (parentWindow) {
  return function postMessageCallParentKarmaMethod (method, args) {
    parentWindow.postMessage({ __karmaMethod: method, __karmaArguments: args }, window.location.origin)
  }
}

// Export our module
module.exports = ContextKarma

},{"../common/stringify":1}],4:[function(require,module,exports){
// Load in our dependencies
const ContextKarma = require('./karma')

// Resolve our parent window
const parentWindow = window.opener || window.parent

// Define a remote call method for Karma
let callParentKarmaMethod = ContextKarma.getDirectCallParentKarmaMethod(parentWindow)

// If we don't have access to the window, then use `postMessage`
// DEV: In Electron, we don't have access to the parent window due to it being in a separate process
// DEV: We avoid using this in Internet Explorer as they only support strings
//   https://caniuse.com/?search=postmessage
let haveParentAccess = false
try { haveParentAccess = !!parentWindow.window } catch (err) { /* Ignore errors (likely permission errors) */ }
if (!haveParentAccess) {
  callParentKarmaMethod = ContextKarma.getPostMessageCallParentKarmaMethod(parentWindow)
}

// Define a window-scoped Karma
window.__karma__ = new ContextKarma(callParentKarmaMethod)

},{"./karma":3}]},{},[4]);
