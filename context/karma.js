// Load our dependencies
const stringify = require('../common/stringify')

// Define our start handler
function UNIMPLEMENTED_START() {
  this.error(
    'You need to include some adapter that implements __karma__.start method!'
  )
}

// Define our context Karma constructor
class ContextKarma {
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
    )
  }

  // Define our loggers
  // DEV: These are intentionally repeated in client and context
  log(type, args = []) {
    const values = args.map((arg) => this.stringify(arg, 3))
    this.info({ log: values.join(', '), type })
  }

  // Define our proxy error handler
  // DEV: We require one in our context to track `hasError`
  error(...args) {
    this.#hasError = true
    this.#callParentKarmaMethod('error', args)
    return false
  }

  // all files loaded, let's start the execution
  loaded() {
    // has error -> cancel
    if (!this.#hasError && !this.#isLoaded) {
      this.#isLoaded = true
      try {
        this.start(this.config)
      } catch (error) {
        this.error(error.stack || error.toString())
      }
    }

    // remove reference to child iframe
    this.start = UNIMPLEMENTED_START
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
    }

    contextWindow.onbeforeunload = () => {
      return this.error('Some of your tests did a full page reload!')
    }

    contextWindow.dump = (...args) => {
      this.log('dump', args)
    }

    const _confirm = contextWindow.confirm
    const _prompt = contextWindow.prompt

    contextWindow.alert = (msg) => {
      this.log('alert', [msg])
    }

    contextWindow.confirm = (msg) => {
      this.log('confirm', [msg])
      return _confirm(msg)
    }

    contextWindow.prompt = (msg, defaultVal) => {
      this.log('prompt', [msg, defaultVal])
      return _prompt(msg, defaultVal)
    }

    if (this.config.captureConsole) {
      const localConsole = contextWindow.console
      const patchConsoleMethod = (method) => {
        const orig = localConsole[method]
        localConsole[method] = (...args) => {
          this.log(method, args)
          try {
            return orig.apply(localConsole, args)
          } catch (error) {
            this.log('warn', [`Console method ${method} threw: ${error}`])
          }
        }
      }
      ;['log', 'info', 'warn', 'error', 'debug'].forEach(patchConsoleMethod)
    }
  }

  // Define call/proxy methods
  static getDirectCallParentKarmaMethod(parentWindow) {
    return function directCallParentKarmaMethod(method, args) {
      if (!parentWindow.karma[method]) {
        parentWindow.karma.error(
          'Expected Karma method "' + method + '" to exist but it doesn\'t'
        )
        return
      }

      parentWindow.karma[method].apply(parentWindow.karma, args)
    }
  }

  static getPostMessageCallParentKarmaMethod(parentWindow) {
    return function postMessageCallParentKarmaMethod(method, args) {
      parentWindow.postMessage(
        { __karmaMethod: method, __karmaArguments: args },
        window.location.origin
      )
    }
  }
}

module.exports = ContextKarma
