function MockSocket() {
  const listeners = {}

  this.addEventListener = function (event, fn) {
    if (!listeners[event]) {
      listeners[event] = []
    }

    listeners[event].push(fn)
  }

  this.emit = function (event, arg) {
    listeners[event]?.forEach((fn) => fn(arg))
  }

  this.emitMessage = function (event, arg) {
    this.emit('message', { data: JSON.stringify([event, arg]) })
  }

  this.disconnect = function () {
    this.emit('disconnect')
  }
}

exports.Socket = MockSocket
