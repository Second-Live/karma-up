const path = require('path')

const createPattern = function (path) {
  return { pattern: path, included: true, served: true, watched: false }
}

const initMocha = function (files, config) {
  const mochaPath = path.dirname(require.resolve('mocha'))
  files.unshift(createPattern(path.join(__dirname, 'mocha-adapter.js')))

  const mochaConfig = config?.client?.mocha
  if (mochaConfig?.require) {
    mochaConfig.require.forEach((requirePath) =>
      files.unshift(createPattern(requirePath))
    )
  }

  files.unshift(createPattern(path.join(mochaPath, 'mocha.js')))

  if (mochaConfig?.reporter) {
    files.unshift(createPattern(path.join(mochaPath, 'mocha.css')))
  }
}

initMocha.$inject = ['config.files', 'config']

module.exports = {
  'framework:mocha': ['factory', initMocha]
}
