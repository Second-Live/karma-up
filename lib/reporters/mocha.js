const helper = require('../helper')
const ansis = require('ansis')

const mochaDefaultConfig = {
  output: 'full',
  ignoreSkipped: false,
  divider: '=',
  colors: {
    info: ansis.grey,
    success: ansis.green,
    warning: ansis.yellow,
    error: ansis.red
  },
  symbols: {
    info: 'ℹ',
    success: '✔',
    warning: '⚠',
    error: '✖'
  },
  showDiff: false,
  printFirstSuccess: false,
  maxLogLines: 999
}

/**
 * The MochaReporter.
 *
 * @param {!object} baseReporterDecorator The karma base reporter.
 * @param {!Function} formatError The karma function to format an error.
 * @param {!object} config The karma config.
 * @constructor
 */
function MochaReporter(baseReporterDecorator, formatError, config) {
  // extend the base reporter
  baseReporterDecorator(this)

  const self = this
  let firstRun = true
  let isRunCompleted = false
  const internalPrefix = '$%$'

  config.mochaReporter = helper.merge(
    mochaDefaultConfig,
    config.mochaReporter || {}
  )

  let outputMode = config.mochaReporter.output
  const ignoreSkipped = config.mochaReporter.ignoreSkipped
  const divider = config.mochaReporter.divider.repeat(
    process.stdout.columns || 80
  )

  const colorUsages = config.colors !== false
  if (colorUsages) {
    const withoutColor = (msg) => msg
    config.mochaReporter.colors = {
      info: withoutColor,
      success: withoutColor,
      warning: withoutColor,
      error: withoutColor
    }
  }

  const colors = {
    success: {
      symbol: config.mochaReporter.symbols.success,
      print: config.mochaReporter.colors.success
    },
    info: {
      symbol: config.mochaReporter.symbols.info,
      print: config.mochaReporter.colors.info
    },
    warning: {
      symbol: config.mochaReporter.symbols.warning,
      print: config.mochaReporter.colors.warning
    },
    error: {
      symbol: config.mochaReporter.symbols.error,
      print: config.mochaReporter.colors.error
    }
  }

  if (isNaN(config.mochaReporter.maxLogLines)) {
    this.write(
      colors.warning.print(
        'Option "config.mochaReporter.maxLogLines" must be of type number. Default value 999 is used!'
      )
    )
    config.mochaReporter.maxLogLines = 999
  }

  // check if mocha is installed when showDiff is enabled
  let mocha = null
  let diff = null
  if (config.mochaReporter.showDiff) {
    try {
      mocha = require('mocha')
      diff = require('diff')
    } catch (e) {
      this.write(
        colors.error.print(
          'Error loading module mocha!\nYou have enabled diff output. That only works with mocha installed!\nRun the following command in your command line:\n  npm install mocha diff\n'
        )
      )
      return
    }
  }

  function getLogSymbol(color) {
    return colorUsages ? color.print(color.symbol) : color.symbol
  }

  /**
   * Returns a unified diff between two strings.
   *
   * @param {Error} err with actual/expected
   * @return {string} The diff.
   */
  function unifiedDiff(err) {
    const indent = '      '

    function cleanUp(line) {
      if (line[0] === '+') {
        return indent + colors.success.print(line)
      }
      if (line[0] === '-') {
        return indent + colors.error.print(line)
      }
      if (line.match(/@@/)) {
        return null
      }
      if (line.match(/\\ No newline/)) {
        return null
      }
      return indent + line
    }

    function notBlank(line) {
      return line !== null
    }

    const msg = diff.createPatch('string', err.actual, err.expected)
    const lines = msg.split('\n').splice(4)
    return (
      '\n      ' +
      colors.success.print('+ expected') +
      ' ' +
      colors.error.print('- actual') +
      '\n\n' +
      lines.map(cleanUp).filter(notBlank).join('\n')
    )
  }

  /**
   * Return a character diff for `err`.
   *
   * @param {Error} err
   * @param {string} type
   * @return {string}
   */
  function errorDiff(err, type) {
    const actual = err.actual
    const expected = err.expected
    return diff['diff' + type](actual, expected)
      .map(function (str) {
        if (str.added) {
          return colors.success.print(str.value)
        }
        if (str.removed) {
          return colors.error.print(str.value)
        }
        return str.value
      })
      .join('')
  }

  /**
   * Returns an inline diff between 2 strings with coloured ANSI output
   *
   * @param {Error} err with actual/expected
   * @return {string} Diff
   */
  function inlineDiff(err) {
    let msg = errorDiff(err, 'WordsWithSpace')

    // linenos
    const lines = msg.split('\n')
    if (lines.length > 4) {
      const width = String(lines.length).length
      msg = lines
        .map((str, i) => `${String(++i).padStart(width)} | ${str}`)
        .join('\n')
    }

    // legend
    msg = `\n${colors.success.print('expected')} ${colors.error.print(
      'actual'
    )}\n\n${msg}\n`

    // indent
    msg = msg.replace(/^/gm, '      ')
    return msg
  }

  /**
   * Returns a formatted time interval
   *
   * @param {!number} time The time.
   * @returns {string}
   */
  function formatTimeInterval(time) {
    const mins = Math.floor(time / 60000)
    const secs = (time - mins * 60000) / 1000
    let str = secs + (secs === 1 ? ' sec' : ' secs')

    if (mins) {
      str = mins + (mins === 1 ? ' min ' : ' mins ') + str
    }

    return str
  }

  /**
   * Checks if all items are completed
   *
   * @param {object} items The item objects
   * @returns {boolean}
   */
  function allChildItemsAreCompleted(items) {
    return Object.values(items).every((item) => {
      if (item.type === 'it') {
        return item.isCompleted
      } else if (item.items) {
        // recursive check of child items
        return allChildItemsAreCompleted(item.items)
      }
      return true
    })
  }

  /**
   * Prints a single item
   *
   * @param {!object} item The item to print
   * @param {number} depth The depth
   */
  function printItem(item, depth) {
    // only print to output once
    if (item.name && !item.printed && (!item.skipped || !ignoreSkipped)) {
      // only print it block when it was ran through all browsers
      if (item.type === 'it' && !item.isCompleted) {
        return
      }

      // indent
      let line = '  '.repeat(depth) + item.name.replace(internalPrefix, '')

      // it block
      if (item.type === 'it') {
        if (item.skipped) {
          // print skipped tests info
          line = colors.info.print(line + ' (skipped)')
        } else {
          // set color to success or error
          line = item.success
            ? colors.success.print(line)
            : colors.error.print(line)
        }
      } else {
        // print name of a suite block in bold
        line = ansis.bold(line)
      }

      // use write method of baseReporter
      self.write(line + '\n')

      // set item as printed
      item.printed = true
    }
  }

  /**
   * Writes the test results to the output
   *
   * @param {!object} suite The test suite
   * @param {number=} depth The indention.
   */
  function print(suite, depth) {
    Object.keys(suite).forEach((key) => {
      const item = suite[key]

      // start of a new suite
      if (item.isRoot) {
        depth = 1
      }

      if (item.items) {
        const allChildItemsCompleted = allChildItemsAreCompleted(item.items)

        if (allChildItemsCompleted) {
          // print current item because all children are completed
          printItem(item, depth)

          // print all child items
          print(item.items, depth + 1)
        }
      } else {
        // print current item which has no children
        printItem(item, depth)
      }
    })
  }

  /**
   * Writes the failed test to the output
   *
   * @param {!object} suite The test suite
   * @param {number=} depth The indention.
   */
  function printFailures(suite, depth) {
    Object.keys(suite).forEach((key) => {
      const item = suite[key]

      // start of a new suite
      if (item.isRoot) {
        depth = 1
      }

      // only print to output when test failed
      if (item.name && !item.success && !item.skipped) {
        // indent
        let line = '  '.repeat(depth) + item.name.replace(internalPrefix, '')

        // it block
        if (item.type === 'it') {
          // make item name error
          line = colors.error.print(line) + '\n'

          // add all browser in which the test failed with color warning
          for (let bi = 0; bi < item.failed.length; bi++) {
            const browserName = item.failed[bi]
            line +=
              '  '.repeat(depth + 1) +
              ansis.italic(colors.warning.print(browserName)) +
              '\n'
          }

          // add the error log in error color
          item.log = item.log || []
          const log = item.log.length ? item.log[0].split('\n') : []
          let linesToLog = config.mochaReporter.maxLogLines
          let ii = 0

          // set number of lines to output
          if (log.length < linesToLog) {
            linesToLog = log.length
          }

          // print diff
          if (
            config.mochaReporter.showDiff &&
            item.assertionErrors &&
            item.assertionErrors[0]
          ) {
            const errorMessage = log.splice(0, 1)[0]

            // print error message before diff
            line += colors.error.print('  '.repeat(depth) + errorMessage + '\n')

            const expected = item.assertionErrors[0].expected
            const actual = item.assertionErrors[0].actual
            const utils = mocha.utils
            const err = { actual, expected }

            if (
              String(err.actual).match(/^".*"$/) &&
              String(err.expected).match(/^".*"$/)
            ) {
              try {
                err.actual = JSON.parse(err.actual)
                err.expected = JSON.parse(err.expected)
              } catch (e) {}
            }

            // ensure that actual and expected are strings
            if (!(utils.isString(actual) && utils.isString(expected))) {
              err.actual = utils.stringify(actual)
              err.expected = utils.stringify(expected)
            }

            // create diff
            const diff =
              config.mochaReporter.showDiff === 'inline'
                ? inlineDiff(err)
                : unifiedDiff(err)

            line += diff + '\n'

            // print formatted stack trace after diff
            for (ii; ii < linesToLog; ii++) {
              line += colors.error.print(formatError(log[ii]))
            }
          } else {
            for (ii; ii < linesToLog; ii++) {
              line += colors.error.print(
                formatError(log[ii], '  '.repeat(depth))
              )
            }
          }
        }

        // use write method of baseReporter
        self.write(line + '\n')
      }

      if (item.items) {
        // print all child items
        printFailures(item.items, depth + 1)
      }
    })
  }

  /**
   * Returns a singularized or plularized noun for "test" based on test count
   *
   * @param {!Number} testCount
   * @returns {String}
   */
  function getTestNounFor(testCount) {
    if (testCount === 1) {
      return 'test'
    }
    return 'tests'
  }

  /**
   * Called each time a test is completed in a given browser.
   *
   * @param {!object} browser The current browser.
   * @param {!object} result The result of the test.
   */
  function specComplete(browser, result) {
    // complete path of the test
    const path = [].concat(result.suite, result.description)
    const maxDepth = path.length - 1

    path.reduce(function (suite, description, depth) {
      // add prefix to description to prevent errors when the description is a reserved name (e.g. 'toString' or 'hasOwnProperty')
      description = internalPrefix + description

      let item = {}

      if (
        Object.hasOwn(suite, description) &&
        suite[description].type === 'it' &&
        self.numberOfBrowsers === 1
      ) {
        description += ' '
      } else {
        item = suite[description] || {}
      }

      suite[description] = item

      item.name = description
      item.isRoot = depth === 0
      item.type = 'describe'
      item.skipped = result.skipped
      item.success =
        (item.success === undefined ? true : item.success) && result.success

      // set item success to true when item is skipped
      if (item.skipped) {
        item.success = true
      }

      // it block
      if (depth === maxDepth) {
        item.type = 'it'
        item.count = item.count || 0
        item.count++
        item.failed = item.failed || []
        item.success = result.success && item.success
        item.name =
          (item.success
            ? getLogSymbol(colors.success)
            : getLogSymbol(colors.error)) +
          ' ' +
          item.name
        item.skipped = result.skipped
        item.visited = item.visited || []
        item.visited.push(browser.name)
        self.netTime += result.time

        if (result.skipped) {
          self.numberOfSkippedTests++
        }

        if (result.success === false) {
          // add browser to failed browsers array
          item.failed.push(browser.name)

          // add error log
          item.log = result.log

          // add assertion errors if available (currently in karma-mocha)
          item.assertionErrors = result.assertionErrors
        }

        if (config.reportSlowerThan && result.time > config.reportSlowerThan) {
          // add slow report warning
          item.name += colors.warning.print(
            ' (slow: ' + formatTimeInterval(result.time) + ')'
          )
          self.numberOfSlowTests++
        }

        if (
          item.count === self.numberOfBrowsers ||
          config.mochaReporter.printFirstSuccess
        ) {
          item.isCompleted = true

          // print results to output when test was ran through all browsers
          if (outputMode !== 'minimal') {
            print(self.allResults, depth)
          }
        }
      } else {
        item.items = item.items || {}
      }

      return item.items
    }, self.allResults)
  }

  self.specSuccess = specComplete
  self.specSkipped = specComplete
  self.specFailure = specComplete

  self.onSpecComplete = function (browser, result) {
    specComplete(browser, result)
  }

  self.onRunStart = function () {
    if (!firstRun && divider) {
      self.write('\n' + ansis.bold(divider) + '\n')
    }
    firstRun = false
    isRunCompleted = false

    self.write('\n' + ansis.underline.bold('START:') + '\n')
    self._browsers = []
    self.allResults = {}
    self.totalTime = 0
    self.netTime = 0
    self.numberOfSlowTests = 0
    self.numberOfSkippedTests = 0
    self.numberOfBrowsers = (config.browsers || []).length || 1
  }

  self.onBrowserStart = function (browser) {
    self._browsers.push(browser)
  }

  self.onRunComplete = function (browsers, results) {
    browsers.forEach(function (browser) {
      self.totalTime += browser.lastResult.totalTime
    })

    // print extra error message for some special cases, e.g. when having the error "Some of your tests did a full page reload!" the onRunComplete() method is called twice
    if (results.error && isRunCompleted) {
      self.write('\n')
      self.write(
        getLogSymbol(colors.error) +
          colors.error.print(
            ' Error while running the tests! Exit code: ' + results.exitCode
          )
      )
      self.write('\n\n')
      return
    }

    isRunCompleted = true

    self.write(
      '\n' +
        colors.success.print(
          'Finished in ' +
            formatTimeInterval(self.totalTime) +
            ' / ' +
            formatTimeInterval(self.netTime) +
            ' @ ' +
            new Date().toTimeString()
        )
    )
    self.write('\n\n')

    if (browsers.length > 0 && !results.disconnected) {
      self.write(ansis.underline.bold('SUMMARY:') + '\n')
      self.write(
        colors.success.print(
          getLogSymbol(colors.success) +
            ' ' +
            results.success +
            ' ' +
            getTestNounFor(results.success) +
            ' completed'
        )
      )
      self.write('\n')

      if (self.numberOfSkippedTests > 0) {
        self.write(
          colors.info.print(
            getLogSymbol(colors.info) +
              ' ' +
              self.numberOfSkippedTests +
              ' ' +
              getTestNounFor(self.numberOfSkippedTests) +
              ' skipped'
          )
        )
        self.write('\n')
      }

      if (self.numberOfSlowTests > 0) {
        self.write(
          colors.warning.print(
            getLogSymbol(colors.warning) +
              ' ' +
              self.numberOfSlowTests +
              ' ' +
              getTestNounFor(self.numberOfSlowTests) +
              ' slow'
          )
        )
        self.write('\n')
      }

      if (results.failed) {
        self.write(
          colors.error.print(
            getLogSymbol(colors.error) +
              ' ' +
              results.failed +
              ' ' +
              getTestNounFor(results.failed) +
              ' failed'
          )
        )
        self.write('\n')

        if (outputMode !== 'noFailures') {
          self.write('\n' + ansis.underline.bold('FAILED TESTS:') + '\n')
          printFailures(self.allResults)
        }
      }
    }

    if (outputMode === 'autowatch') {
      outputMode = 'minimal'
    }
  }
}

// inject karma runner baseReporter and config
MochaReporter.$inject = ['baseReporterDecorator', 'formatError', 'config']

module.exports = {
  'reporter:mocha': ['type', MochaReporter]
}
