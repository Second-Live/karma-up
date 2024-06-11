const { WebSocketServer } = require('ws')
const crypto = require('crypto')
const EventEmitter = require('events').EventEmitter

function createSocketIoServer(webServer, executor, config) {
  const interval = setInterval(() => {
    server.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate()

      ws.isAlive = false
      ws.ping()
    })
  }, config.pingTimeout || 30000)

  const server = new WebSocketServer({
    urlRoot: config.urlRoot,
    server: webServer
  })
  server.on('close', () => clearInterval(interval))
  server.on('connection', (ws) => {
    ws.isAlive = true
    ws.id = crypto.randomUUID()
    ws.emitter = new EventEmitter()
    ws.on('pong', function () {
      this.isAlive = true
    })
    ws.on('message', (buffer) => {
      const decoder = new TextDecoder()
      const str = decoder.decode(buffer)
      const [type, info] = JSON.parse(str)
      ws.emitter.emit(type, info)
    })
  })
  server.emit = function (event, info) {
    server.clients.forEach((ws) => ws.send(JSON.stringify([event, info])))
  }

  // hack to overcome circular dependency
  executor.socketIoSockets = server

  return server
}

module.exports = createSocketIoServer
