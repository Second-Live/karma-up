const http = require('http')
const cfg = require('./config')
const logger = require('./logger')
const helper = require('./helper')
const { lookup } = require('./utils/dns-utils')

exports.stop = function (config = {}, done) {
  const log = logger.create('stopper')
  done = helper.isFunction(done) ? done : process.exit

  if (!(config instanceof cfg.Config)) {
    throw new Error(
      'config must be intance of Config, not the object literal. Use parseConfig to get it.'
    )
  }

  const request = http.request({
    hostname: config.hostname,
    path: config.urlRoot + 'stop',
    port: config.port,
    method: 'GET',
    lookup
  })

  request.on('response', function (response) {
    if (response.statusCode === 200) {
      log.info('Server stopped.')
      done(0)
    } else {
      log.error(`Server returned status code: ${response.statusCode}`)
      done(1)
    }
  })

  request.on('error', function (e) {
    if (e.code === 'ECONNREFUSED') {
      log.error(`There is no server listening on port ${config.port}`)
      done(1, e.code)
    } else {
      throw e
    }
  })
  request.end()
}
