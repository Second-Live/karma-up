const VERSION = require('./constants').VERSION

function StatusUpdater (socket, titleElement, bannerElement, browsersElement) {
  function updateBrowsersInfo (browsers) {
    if (!browsersElement) {
      return
    }
    const elems = browsers.map(({ isConnected, name }) => {
      const status = isConnected ? 'idle' : 'executing'
      const li = document.createElement('li')
      li.className = status
      li.textContent = `${name} is ${status}`
      return li
    })
    browsersElement.replaceChildren(...elems)
  }

  let connectionText = 'never-connected'
  let testText = 'loading'
  let pingText = ''

  function updateBanner () {
    if (!titleElement || !bannerElement) {
      return
    }
    titleElement.textContent = `Karma v ${VERSION} - ${connectionText}; test: ${testText}; ${pingText}`
    bannerElement.className = connectionText === 'connected' ? 'online' : 'offline'
  }

  function updateConnectionStatus (connectionStatus) {
    connectionText = connectionStatus || connectionText
    updateBanner()
  }
  function updateTestStatus (testStatus) {
    testText = testStatus || testText
    updateBanner()
  }
  function updatePingStatus (pingStatus) {
    pingText = pingStatus || pingText
    updateBanner()
  }

  socket.on('connect', function () {
    updateConnectionStatus('connected')
  })
  socket.on('disconnect', function () {
    updateConnectionStatus('disconnected')
  })
  socket.on('reconnecting', function (sec) {
    updateConnectionStatus('reconnecting in ' + sec + ' seconds')
  })
  socket.on('reconnect', function () {
    updateConnectionStatus('reconnected')
  })
  socket.on('reconnect_failed', function () {
    updateConnectionStatus('reconnect_failed')
  })

  socket.on('info', updateBrowsersInfo)
  socket.on('disconnect', function () {
    updateBrowsersInfo([])
  })

  socket.on('ping', function () {
    updatePingStatus('ping...')
  })
  socket.on('pong', function (latency) {
    updatePingStatus('ping ' + latency + 'ms')
  })

  return { updateTestStatus }
}

module.exports = StatusUpdater
