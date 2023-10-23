(function () {
  'use strict';

  var main = {};

  var util = {};

  (function (exports) {
  	exports.instanceOf = function (value, constructorName) {
  	  return Object.prototype.toString.apply(value) === '[object ' + constructorName + ']'
  	};

  	exports.elm = function (id) {
  	  return document.getElementById(id)
  	};

  	exports.generateId = function (prefix) {
  	  return prefix + Math.floor(Math.random() * 10000)
  	};

  	exports.isUndefined = function (value) {
  	  return typeof value === 'undefined'
  	};

  	exports.isDefined = function (value) {
  	  return !exports.isUndefined(value)
  	}; 
  } (util));

  const instanceOf = util.instanceOf;

  function isNode (obj) {
    return (obj.tagName || obj.nodeName) && obj.nodeType
  }

  function stringify$1 (obj, depth) {
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
      case 'object': {
        const strs = [];
        if (instanceOf(obj, 'Array')) {
          strs.push('[');
          for (let i = 0, ii = obj.length; i < ii; i++) {
            if (i) {
              strs.push(', ');
            }
            strs.push(stringify$1(obj[i], depth - 1));
          }
          strs.push(']');
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
          let constructor = 'Object';
          if (obj.constructor && typeof obj.constructor === 'function') {
            constructor = obj.constructor.name;
          }

          strs.push(constructor);
          strs.push('{');
          let first = true;
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              if (first) {
                first = false;
              } else {
                strs.push(', ');
              }

              strs.push(key + ': ' + stringify$1(obj[key], depth - 1));
            }
          }
          strs.push('}');
        }
        return strs.join('')
      }
      default:
        return obj
    }
  }

  var stringify_1 = stringify$1;

  // Load our dependencies
  const stringify = stringify_1;

  // Define our start handler
  function UNIMPLEMENTED_START() {
    this.error(
      'You need to include some adapter that implements __karma__.start method!'
    );
  }

  // Define our context Karma constructor
  let ContextKarma$1 = class ContextKarma {
    #hasError = false
    #isLoaded = false
    #callParentKarmaMethod = null

    stringify = stringify
    // supposed to be overridden by the context
    // TODO(vojta): support multiple callbacks (queue)
    start = UNIMPLEMENTED_START

    constructor(callParentKarmaMethod) {
      this.#callParentKarmaMethod = callParentKarmaMethod
      // Define proxy methods
      ;['complete', 'info', 'result'].forEach(
        (methodName) =>
          (this[methodName] = (...args) =>
            callParentKarmaMethod(methodName, args))
      );
    }

    // Define our loggers
    // DEV: These are intentionally repeated in client and context
    log(type, args = []) {
      const values = args.map((arg) => this.stringify(arg, 3));
      this.info({ log: values.join(', '), type });
    }

    // Define our proxy error handler
    // DEV: We require one in our context to track `hasError`
    error(...args) {
      this.#hasError = true;
      this.#callParentKarmaMethod('error', args);
      return false
    }

    // all files loaded, let's start the execution
    loaded() {
      // has error -> cancel
      if (!this.#hasError && !this.#isLoaded) {
        this.#isLoaded = true;
        try {
          this.start(this.config);
        } catch (error) {
          this.error(error.stack || error.toString());
        }
      }

      // remove reference to child iframe
      this.start = UNIMPLEMENTED_START;
    }

    // Define bindings for context window
    setupContext(contextWindow) {
      // If we clear the context after every run and we already had an error
      //   then stop now. Otherwise, carry on.
      if (this.config.clearContext && this.#hasError) {
        return
      }

      // Perform window level bindings
      // DEV: We return `this.error` since we want to `return false` to ignore errors
      contextWindow.onerror = (...args) => {
        return this.error(...args)
      };

      contextWindow.onunhandledrejection = (event) => this.error(event);

      contextWindow.onbeforeunload = () => {
        return this.error('Some of your tests did a full page reload!')
      };

      contextWindow.dump = (...args) => {
        this.log('dump', args);
      };

      const _confirm = contextWindow.confirm;
      const _prompt = contextWindow.prompt;

      contextWindow.alert = (msg) => {
        this.log('alert', [msg]);
      };

      contextWindow.confirm = (msg) => {
        this.log('confirm', [msg]);
        return _confirm(msg)
      };

      contextWindow.prompt = (msg, defaultVal) => {
        this.log('prompt', [msg, defaultVal]);
        return _prompt(msg, defaultVal)
      };

      if (this.config.captureConsole) {
        const localConsole = contextWindow.console;
        const patchConsoleMethod = (method) => {
          const orig = localConsole[method];
          localConsole[method] = (...args) => {
            this.log(method, args);
            try {
              return orig.apply(localConsole, args)
            } catch (error) {
              this.log('warn', [`Console method ${method} threw: ${error}`]);
            }
          };
        }
        ;['log', 'info', 'warn', 'error', 'debug'].forEach(patchConsoleMethod);
      }
    }

    // Define call/proxy methods
    static getDirectCallParentKarmaMethod(parentWindow) {
      return function directCallParentKarmaMethod(method, args) {
        if (!parentWindow.karma[method]) {
          parentWindow.karma.error(
            'Expected Karma method "' + method + '" to exist but it doesn\'t'
          );
          return
        }

        parentWindow.karma[method].apply(parentWindow.karma, args);
      }
    }

    static getPostMessageCallParentKarmaMethod(parentWindow) {
      return function postMessageCallParentKarmaMethod(method, args) {
        parentWindow.postMessage(
          { __karmaMethod: method, __karmaArguments: args },
          window.location.origin
        );
      }
    }
  };

  var karma = ContextKarma$1;

  // Load in our dependencies
  const ContextKarma = karma;

  // Resolve our parent window
  const parentWindow = window.opener || window.parent;

  // Define a remote call method for Karma
  let callParentKarmaMethod = ContextKarma.getDirectCallParentKarmaMethod(parentWindow);

  // If we don't have access to the window, then use `postMessage`
  // DEV: In Electron, we don't have access to the parent window due to it being in a separate process
  // DEV: We avoid using this in Internet Explorer as they only support strings
  //   https://caniuse.com/?search=postmessage
  let haveParentAccess = false;
  try { haveParentAccess = !!parentWindow.window; } catch (err) { /* Ignore errors (likely permission errors) */ }
  if (!haveParentAccess) {
    callParentKarmaMethod = ContextKarma.getPostMessageCallParentKarmaMethod(parentWindow);
  }

  // Define a window-scoped Karma
  window.__karma__ = new ContextKarma(callParentKarmaMethod);

  return main;

})();
