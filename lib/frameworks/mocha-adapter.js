const formatError = function (error) {
  let stack = error.stack
  const message = error.message

  if (stack) {
    if (message && !stack.includes(message)) {
      stack = message + '\n' + stack
    }

    // remove mocha stack entries
    return stack.replace(/\n.+\/mocha\/mocha\.js\?\w*:[\d:]+\)?(?=(\n|$))/g, '')
  }

  return message
}

const processAssertionError = function (error_) {
  let error

  if (window.Mocha && Object.hasOwn(error_, 'showDiff')) {
    error = {
      name: error_.name,
      message: error_.message,
      showDiff: error_.showDiff
    }

    if (error.showDiff) {
      error.actual = window.Mocha.utils.stringify(error_.actual)
      error.expected = window.Mocha.utils.stringify(error_.expected)
    }
  }

  return error
}

const createMochaReporterNode = function () {
  const mochaRunnerNode = document.createElement('div')
  mochaRunnerNode.setAttribute('id', 'mocha')
  document.body.appendChild(mochaRunnerNode)
}

const haveMochaConfig = function (karma) {
  return karma.config?.mocha
}

const reportTestResult = function (karma, test) {
  const skipped = test.pending === true

  const result = {
    id: '',
    description: test.title,
    suite: [],
    success: test.state === 'passed',
    skipped,
    pending: skipped,
    time: skipped ? 0 : test.duration,
    log: test.$errors || [],
    assertionErrors: test.$assertionErrors || [],
    startTime: test.$startTime,
    endTime: Date.now()
  }

  let pointer = test.parent
  while (!pointer.root) {
    result.suite.unshift(pointer.title)
    pointer = pointer.parent
  }

  if (haveMochaConfig(karma) && karma.config?.mocha?.expose?.forEach) {
    result.mocha = {}
    karma.config.mocha.expose.forEach((prop) => {
      if (Object.hasOwn(test, prop)) {
        result.mocha[prop] = test[prop]
      }
    })
  }

  karma.result(result)
}

const createMochaReporterConstructor = function (tc, pathname) {
  const isDebugPage = /debug.html$/.test(pathname)

  // Set custom reporter on debug page
  if (isDebugPage && haveMochaConfig(tc) && tc.config.mocha.reporter) {
    createMochaReporterNode()
    return tc.config.mocha.reporter
  }

  // TODO(vojta): error formatting
  return function (runner) {
    // runner events
    // - start
    // - end
    // - suite
    // - suite end
    // - test
    // - test end
    // - pass
    // - fail
    // - pending

    runner.on('start', function () {
      tc.info({ total: runner.total })
    })

    runner.on('end', function () {
      tc.complete({
        coverage: window.__coverage__
      })
    })

    runner.on('test', function (test) {
      test.$startTime = Date.now()
      test.$errors = []
      test.$assertionErrors = []
    })

    runner.on('pending', function (test) {
      test.pending = true
    })

    runner.on('fail', function (test, error) {
      const simpleError = formatError(error)
      const assertionError = processAssertionError(error)

      if (test.type === 'hook') {
        test.$errors = isDebugPage ? [error] : [simpleError]
        test.$assertionErrors = assertionError ? [assertionError] : []
        reportTestResult(tc, test)
      } else {
        test.$errors.push(isDebugPage ? error : simpleError)
        if (assertionError) test.$assertionErrors.push(assertionError)
      }
    })

    runner.on('test end', function (test) {
      reportTestResult(tc, test)
    })
  }
}

const createMochaStartFn = function (mocha) {
  return function (config = {}) {
    const clientArguments = config.args

    if (clientArguments) {
      if (Array.isArray(clientArguments)) {
        clientArguments.reduce((isGrepArg, arg) => {
          if (isGrepArg) {
            mocha.grep(new RegExp(arg))
          } else if (arg === '--grep') {
            return true
          } else {
            const match = /--grep=(.*)/.exec(arg)

            if (match) {
              mocha.grep(new RegExp(match[1]))
            }
          }
          return false
        }, false)
      }

      /**
       * TODO(maksimrv): remove when karma-grunt plugin will pass
       * clientArguments how Array
       */
      if (clientArguments.grep) {
        mocha.grep(clientArguments.grep)
      }
    }

    mocha.run()
  }
}

// Default configuration
const mochaConfig = {
  reporter: createMochaReporterConstructor(
    window.__karma__,
    window.location.pathname
  ),
  ui: 'bdd',
  globals: ['__cov*']
}

// Pass options from client.mocha to mocha
const createConfigObject = function (karma) {
  if (!karma.config?.mocha) {
    return mochaConfig
  }

  // Copy all properties to mochaConfig
  for (const key in karma.config.mocha) {
    // except for reporter, require, or expose
    if (['reporter', 'require', 'expose'].includes(key)) {
      continue
    }

    // and merge the globals if they exist.
    if (key === 'globals') {
      mochaConfig.globals = mochaConfig.globals.concat(karma.config.mocha[key])
      continue
    }

    mochaConfig[key] = karma.config.mocha[key]
  }
  return mochaConfig
}

window.__karma__.start = createMochaStartFn(window.mocha)
window.mocha.setup(createConfigObject(window.__karma__))
